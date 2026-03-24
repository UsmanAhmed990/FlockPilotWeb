const User = require('../models/User');
const Chef = require('../models/Chef');
const SellerCertificate = require('../models/SellerCertificate');
const bcrypt = require('bcryptjs');
const sendEmail = require('../utils/sendEmail');
const { createAdminNotification } = require('./adminNotificationController');
const fs = require('fs');
const path = require('path');

const logToFile = (message) => {
    const logPath = path.join(__dirname, '../debug.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
};

// ================= REGISTER (SIGNUP ONLY) =================
exports.registerUser = async (req, res) => {
    try {
        logToFile(`SIGNUP START: role: ${req.body.role}, email: ${req.body.email}`);
        let { name, email, role, phone, password, address } = req.body;

        if (!email || !phone || !password) {
            logToFile(`SIGNUP FAILED: Missing required fields`);
            return res.status(400).json({ message: 'Email, Phone, and Password are required' });
        }

        email = email.toLowerCase();

        // Seller must provide a name/shopname and address
        if (role === 'seller' && (!name || !address)) {
            logToFile(`SIGNUP FAILED: Seller missing name or address. name: ${name}, address: ${address}`);
            return res.status(400).json({ message: 'Sellers must provide Shop Name and Shop Address' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            logToFile(`SIGNUP FAILED: User already exists - ${email}`);
            return res.status(409).json({ message: 'User already registered' });
        }

        // Normalize empty strings
        if (name === '') name = undefined;
        if (address === '') address = undefined;

        logToFile(`DEBUG: Creating user with role ${role}`);
        const user = await User.create({
            name: name || (role === 'buyer' ? 'Buyer' : undefined),
            email,
            phone,
            password,
            role: role || 'buyer',
            address,
            isVerified: (role === 'seller' || role === 'chef') ? false : true,
            verificationStatus: (role === 'seller' || role === 'chef') ? 'pending' : 'approved'
        });
        logToFile(`DEBUG: User created successfully. ID: ${user._id}`);

        // Non-blocking notifications (won't crash registration if they fail)
        if (role === 'chef' || role === 'seller') {
            logToFile(`DEBUG: Creating Chef and Admin Notification for seller`);
            Chef.create({ user: user._id }).catch(err => {
                logToFile(`Chef create error: ${err.message}`);
                console.error('Chef create error:', err);
            });
            createAdminNotification(req, 'signup', `New Seller registered: ${user.name} (${user.email}) - Shop: ${address}`).catch((err) => { 
                logToFile(`Admin Notification error: ${err.message}`);
            });

            // Handle Certificate
            if (req.file) {
                logToFile(`DEBUG: File found, creating SellerCertificate: ${req.file.filename}`);
                SellerCertificate.create({
                    sellerId: user._id,
                    email: user.email,
                    username: user.name,
                    address: user.address,
                    certificateUrl: `/uploads/certificates/${req.file.filename}`
                }).catch(err => {
                    logToFile(`SellerCertificate create error: ${err.message}`);
                    console.error('SellerCertificate create error:', err);
                });
            } else {
                logToFile(`DEBUG: No certificate file found for seller`);
            }
        } else {
            createAdminNotification(req, 'signup', `New Buyer registered: ${user.name || user.email} (${user.phone})`).catch(() => { });
        }

        // Send Notification Email (Non-blocking)
        logToFile(`DEBUG: Sending welcome email to ${user.email}`);
        sendEmail({
            email: user.email,
            subject: `Welcome to FlockPilot - ${role === 'buyer' ? 'Start Your Food Journey!' : 'Grow Your Business!'}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #eee; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 40px 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">FlockPilot</h1>
                        <p style="color: #ffffff; opacity: 0.9; margin: 8px 0 0; font-size: 16px; font-weight: 500;">Fresh..Fast..Delivered</p>
                    </div>
                    
                    <div style="padding: 40px 30px; color: #333; line-height: 1.6;">
                        <h2 style="color: #1a1a1a; margin-top: 0;">Welcome to the Family, ${user.name || 'there'}!</h2>
                        <p>We're thrilled to have you on board. Your account as a <b>${role === 'buyer' ? 'Buyer' : 'Seller'}</b> has been successfully created.</p>
                        
                        ${role === 'buyer' ? `
                            <p>Get ready to discover your own marketplace. Fresh ingredients and doorstep delivery — it's all waiting for you.</p>
                        ` : `
                            <p>Your shop is now part of our growing community of artisan sellers. We'll review your details shortly to get you fully verified and ready to sell.</p>
                        `}
                        
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
                        <p style="font-size: 14px; color: #666; font-style: italic;">"Food is the ingredient that binds us together."</p>
                    </div>
                    
                    <div style="background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee;">
                        <p style="margin: 0;">&copy; 2026 FlockPilot Platform. All rights reserved.</p>
                    </div>
                </div>
            `
        }).catch(err => {
            logToFile(`Background Email Error: ${err.message}`);
            console.error('Background Email Error:', err);
        });

        logToFile(`SIGNUP SUCCESS: User ${user.email} registered successfully.`);
        res.status(201).json({
            success: true,
            user
        });

    } catch (error) {
        logToFile(`SIGNUP CRITICAL ERROR: ${error.message}`);
        console.error('REGISTRATION ERROR:', error);
        res.status(500).json({ 
            message: 'Registration failed', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// LOGIN USER
exports.loginUser = async (req, res) => {
    try {
        let { email, password, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please enter Email and Password' });
        }

        email = email.toLowerCase();

        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            logToFile(`LOGIN FAILED: User not found for ${email}`);
            return res.status(401).json({ message: 'User not found. Please sign up first.' });
        }

        const isPasswordMatched = await user.comparePassword(password);
        logToFile(`DEBUG: loginUser - email: ${email}, role: ${role}, userFound: ${!!user}, passwordMatched: ${isPasswordMatched}`);

        if (!isPasswordMatched) {
            logToFile(`LOGIN FAILED: Incorrect password for ${email}`);
            return res.status(401).json({ message: 'Incorrect password. Please try again.' });
        }

        // Check if role matches if role is provided
        // Allow 'chef' and 'seller' to be interchangeable
        if (role) {
            const isSellerRole = (role === 'seller' || role === 'chef');
            const isUserSellerRole = (user.role === 'seller' || user.role === 'chef');

            if (isSellerRole && !isUserSellerRole) {
                return res.status(401).json({
                    message: `You are registered as a ${user.role}. Please select the correct role to login.`
                });
            }

            if (!isSellerRole && user.role !== role) {
                logToFile(`LOGIN FAILED: Role mismatch for ${email}. Expected ${role}, got ${user.role}`);
                return res.status(401).json({
                    message: `You are registered as a ${user.role}. Please select the correct role to login.`
                });
            }
        }

        if (user.role === 'chef' || user.role === 'seller') {
            await createAdminNotification(req, 'login', `Seller logged in: ${user.name} (${user.email})`);
        }

        logToFile(`LOGIN SUCCESS: User ${user.email} logged in successfully.`);

        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        console.error('LOGIN ERROR:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.logoutUser = (req, res) => {
    // Frontend handles token removal
    res.status(200).json({ success: true, message: 'Logged out successfully' });
};

exports.getUserProfile = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        // Handle guest_admin identity (virtual admin defined in .env but not in DB)
        if (req.user.id === 'guest_admin') {
            return res.status(200).json({
                success: true,
                user: req.user
            });
        }

        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('GET USER PROFILE ERROR:', error);
        res.status(500).json({ message: error.message });
    }
};
// ================= ADMIN: ALL USERS (PAGINATED) =================
// ================= ADMIN: ALL USERS (PAGINATED) =================
exports.getAdminAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Ensure role is a string if it's passed as an array
        let role = req.query.role;
        if (Array.isArray(role)) role = role[0];

        const filter = role && role !== 'all' ? { role: role.toLowerCase() } : {};

        console.log(`[getAdminAllUsers] Fetching users with filter: ${JSON.stringify(filter)}`);

        const totalUsers = await User.countDocuments(filter);
        const users = await User.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            users,
            totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
            currentPage: page
        });
    } catch (error) {
        console.error('ADMIN ALL USERS ERROR:', error);
        res.status(500).json({ message: 'Failed to fetch users', error: error.message });
    }
};

// ================= FORGOT PASSWORD =================
exports.forgotPassword = async (req, res) => {
    try {
        let { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Please enter your email address' });
        }

        email = email.toLowerCase();

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'No account found with this email address' });
        }

        // Check resend limit
        if (user.resetOtpAttempts >= 5) {
            return res.status(429).json({ message: 'Maximum OTP resend limit reached (5). Please try again later or contact support.' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Hash OTP before storing
        const salt = await bcrypt.genSalt(10);
        const hashedOtp = await bcrypt.hash(otp, salt);

        // Save to user
        user.resetOtp = hashedOtp;
        user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
        await user.save({ validateBeforeSave: false });

        // Send OTP email
        await sendEmail({
            email: user.email,
            subject: 'FlockPilot - Password Reset OTP',
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0a0a; border-radius: 16px; overflow: hidden; border: 1px solid #333;">
                    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; text-align: center;">
                        <h1 style="color: #000; font-size: 24px; margin: 0; font-weight: 800;">🔐 Password Reset</h1>
                        <p style="color: #000; opacity: 0.7; margin: 8px 0 0; font-size: 14px;">FlockPilot Security</p>
                    </div>
                    <div style="padding: 32px; text-align: center;">
                        <p style="color: #ccc; font-size: 14px; margin: 0 0 24px;">Hi <strong style="color: #fff;">${user.name || 'there'}</strong>, use this OTP to reset your password:</p>
                        <div style="background: #1a1a1a; border: 2px solid #f59e0b; border-radius: 12px; padding: 20px; display: inline-block;">
                            <span style="font-size: 36px; font-weight: 900; letter-spacing: 12px; color: #f59e0b; font-family: monospace;">${otp}</span>
                        </div>
                        <p style="color: #888; font-size: 12px; margin: 24px 0 0;">⏱ This code expires in <strong style="color: #f59e0b;">10 minutes</strong></p>
                        <p style="color: #666; font-size: 11px; margin: 16px 0 0;">If you didn't request this, please ignore this email.</p>
                    </div>
                </div>
            `
        });

        res.status(200).json({
            success: true,
            message: `OTP sent to ${email}. Check your inbox!`,
            attemptsLeft: 5 - user.resetOtpAttempts
        });

    } catch (error) {
        console.error('FORGOT PASSWORD ERROR:', error);
        res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
    }
};

// ================= VERIFY OTP =================
exports.verifyOtp = async (req, res) => {
    try {
        let { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        email = email.toLowerCase();

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.resetOtp || !user.resetOtpExpiry) {
            return res.status(400).json({ message: 'No OTP request found. Please request a new OTP.' });
        }

        // Check expiry
        if (new Date() > user.resetOtpExpiry) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        // Verify OTP
        const isMatch = await bcrypt.compare(otp, user.resetOtp);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
        }

        res.status(200).json({ success: true, message: 'OTP verified successfully!' });

    } catch (error) {
        console.error('VERIFY OTP ERROR:', error);
        res.status(500).json({ message: 'OTP verification failed' });
    }
};

// ================= RESET PASSWORD =================
exports.resetPassword = async (req, res) => {
    try {
        let { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Email, OTP, and new password are required' });
        }

        email = email.toLowerCase();

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Re-verify OTP
        if (!user.resetOtp || !user.resetOtpExpiry || new Date() > user.resetOtpExpiry) {
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }

        const isMatch = await bcrypt.compare(otp, user.resetOtp);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Update password (pre-save hook will hash it)
        user.password = newPassword;
        user.resetOtp = undefined;
        user.resetOtpExpiry = undefined;
        user.resetOtpAttempts = 0;
        await user.save();

        res.status(200).json({ success: true, message: 'Password reset successfully! You can now login.' });

    } catch (error) {
        console.error('RESET PASSWORD ERROR:', error);
        res.status(500).json({ message: 'Password reset failed' });
    }
};

// ================= VERIFY ADMIN (PRE-DASHBOARD) =================
exports.verifyAdmin = async (req, res) => {
    try {
        const { email, passcode } = req.body;

        if (!email || !passcode) {
            return res.status(400).json({ message: 'Email and Passcode are required' });
        }

        const allowedEmails = (process.env.ADMIN_ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
        const passwordHash = process.env.ADMIN_PASSWORD_HASH;

        const isEmailAllowed = allowedEmails.includes(email.toLowerCase());
        const isPasscodeValid = await bcrypt.compare(passcode, passwordHash);

        if (isEmailAllowed && isPasscodeValid) {
            return res.status(200).json({
                success: true,
                message: 'Admin access granted'
            });
        }

        res.status(401).json({ message: 'Access denied. Invalid email or passcode' });

    } catch (error) {
        console.error('VERIFY ADMIN ERROR:', error);
        res.status(500).json({ message: 'Verification failed' });
    }
};
