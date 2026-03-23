import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import axios from '../utils/axios';
import { io } from 'socket.io-client';
import { Send } from 'lucide-react';

const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5020', {
    withCredentials: true
});

const Chat = ({ otherUserId }) => {
    const { user } = useSelector(state => state.auth);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (user) {
            socket.emit('join', user.id);
        }

        const fetchMessages = async () => {
            try {
                const { data } = await axios.get(`/api/chat/${otherUserId}`);
                setMessages(data.messages);
            } catch (error) {
                console.error('Error fetching messages:', error);
            }
        };

        fetchMessages();

        socket.on('message', (msg) => {
            if (msg.senderId === otherUserId) {
                setMessages(prev => [...prev, {
                    sender: otherUserId,
                    content: msg.content,
                    createdAt: msg.createdAt
                }]);
            }
        });

        return () => {
            socket.off('message');
        };
    }, [otherUserId, user]);

    useEffect(scrollToBottom, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        try {
            const { data } = await axios.post('/api/chat/send', {
                receiverId: otherUserId,
                content: newMessage
            });
            
            setMessages(prev => [...prev, data.message]);
            socket.emit('sendMessage', {
                senderId: user.id,
                receiverId: otherUserId,
                content: newMessage
            });
            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    return (
        <div className="flex flex-col h-[500px] bg-white">
            <div className="flex-grow overflow-y-auto p-4 space-y-4">
                {messages.map((msg, index) => (
                    <div 
                        key={index} 
                        className={`flex ${msg.sender === user.id ? 'justify-end' : 'justify-start'}`}
                    >
                        <div 
                            className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                msg.sender === user.id 
                                    ? 'bg-royal-blue text-white rounded-tr-none' 
                                    : 'bg-gray-100 text-gray-800 rounded-tl-none'
                            }`}
                        >
                            <p className="text-sm">{msg.content}</p>
                            <span className="text-[10px] opacity-70 block text-right mt-1">
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            
            <form onSubmit={handleSend} className="p-4 border-t flex gap-2">
                <input
                    type="text"
                    placeholder="Type a message..."
                    className="flex-grow border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-royal-blue/20"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                />
                <button 
                    type="submit"
                    className="bg-royal-blue text-white p-2 rounded-xl hover:bg-royal-blue-dark transition disabled:opacity-50"
                    disabled={!newMessage.trim()}
                >
                    <Send size={20} />
                </button>
            </form>
        </div>
    );
};

export default Chat;
