import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

export default function UltraMediaChatApp() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [isUsernameSet, setIsUsernameSet] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [bufferSize, setBufferSize] = useState(null);
  const [newMedia, setNewMedia] = useState(null);
  const [newMediaPreview, setNewMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [messages, setMessages] = useState([]);
  const [allMedia, setAllMedia] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const messagesEndRef = useRef(null);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allMedia, messages]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize socket connection when username is set
  useEffect(() => {
    if (!isUsernameSet || !username) return;

    const newSocket = io('https://debug-chat-bnc.onrender.com');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      newSocket.emit('user_join', { username });
      setMessages(prev => [...prev, {
        type: 'system',
        content: `Connected as ${username}`,
        timestamp: new Date()
      }]);
    });

    newSocket.on('user_joined', (data) => {
      setMessages(prev => [...prev, {
        type: 'system',
        content: `${data.username} joined the chat`,
        timestamp: new Date()
      }]);
    });

    newSocket.on('user_left', (data) => {
      setMessages(prev => [...prev, {
        type: 'system',
        content: `${data.username} left the chat`,
        timestamp: new Date()
      }]);
      // Clear target user if they left
      setTargetUser(prev => prev === data.username ? '' : prev);
    });

    newSocket.on('online_users', (users) => {
      setOnlineUsers(users);
      // Clear target user if they're no longer online
      setTargetUser(prev => {
        if (prev && !users.some(user => user.username === prev)) {
          return '';
        }
        return prev;
      });
    });

    newSocket.on('get_media', (data) => {
      console.log('Received media data:', data);
      
      if (data && data.buffer) {
        try {
          let uint8Array;
          
          if (data.buffer instanceof ArrayBuffer) {
            uint8Array = new Uint8Array(data.buffer);
          } else if (Array.isArray(data.buffer)) {
            uint8Array = new Uint8Array(data.buffer);
          } else if (data.buffer.data && Array.isArray(data.buffer.data)) {
            uint8Array = new Uint8Array(data.buffer.data);
          } else {
            uint8Array = new Uint8Array(data.buffer);
          }

          const blob = new Blob([uint8Array], { type: data.mediaType || 'application/octet-stream' });
          const mediaUrl = URL.createObjectURL(blob);
          
          const mediaData = {
            id: data.from || 'unknown',
            url: mediaUrl,
            size: uint8Array.length,
            timestamp: new Date(),
            type: 'received',
            mediaType: data.mediaType || 'unknown',
            filename: data.filename || 'media'
          };
          
          setAllMedia(prev => [...prev, mediaData]);
          
        } catch (error) {
          console.error('Error processing received media:', error);
          setMessages(prev => [...prev, {
            type: 'error',
            content: 'Error processing received media',
            timestamp: new Date()
          }]);
        }
      }
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setMessages(prev => [...prev, {
        type: 'system',
        content: 'Disconnected from server',
        timestamp: new Date()
      }]);
    });

    return () => {
      newSocket.close();
      allMedia.forEach(media => URL.revokeObjectURL(media.url));
    };
  }, [isUsernameSet, username]);

  const handleUsernameSubmit = () => {
    if (tempUsername.trim()) {
      const cleanUsername = tempUsername.trim();
      setUsername(cleanUsername);
      setIsUsernameSet(true);
    }
  };

  const handleUserSelect = (selectedUsername) => {
    setTargetUser(selectedUsername);
    setShowUserDropdown(false);
  };

  const clearTargetUser = () => {
    setTargetUser('');
  };

  const formatBufferSize = (bytes) => {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  };

  const getMediaIcon = (type) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎥';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    return '📎';
  };

  const handleMediaChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      const uint8Array = new Uint8Array(arrayBuffer);
      setNewMedia({
        buffer: uint8Array,
        filename: file.name,
        type: file.type
      });
      setMediaType(file.type);
      setBufferSize(uint8Array.length);
      
      // Create preview for images and videos
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        const blob = new Blob([uint8Array], { type: file.type });
        const previewUrl = URL.createObjectURL(blob);
        setNewMediaPreview(previewUrl);
      } else {
        setNewMediaPreview(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMediaSend = () => {
    if (socket && newMedia && targetUser.trim()) {
      const targetUsername = targetUser.trim();
      socket.emit("media_upload", { 
        buffer: newMedia.buffer, 
        targetUser: targetUsername,
        mediaType: newMedia.type,
        filename: newMedia.filename
      });
      
      // Add sent media to display
      const sentMediaData = {
        id: `To: ${targetUsername}`,
        url: newMediaPreview || null,
        size: bufferSize,
        timestamp: new Date(),
        type: 'sent',
        mediaType: newMedia.type,
        filename: newMedia.filename
      };
      
      setAllMedia(prev => [...prev, sentMediaData]);
      
      // Reset form
      setNewMedia(null);
      setNewMediaPreview(null);
      setBufferSize(null);
      setMediaType('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  // Available users excluding current user
  const availableUsers = onlineUsers.filter(user => user.username !== username);

  // Username setup modal
  if (!isUsernameSet) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
          }

          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
            animation: fadeIn 0.3s ease-out;
          }

          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .modal-content {
            background: white;
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
            max-width: 450px;
            width: 100%;
            text-align: center;
            animation: slideUp 0.4s ease-out;
            position: relative;
            overflow: hidden;
          }

          .modal-content::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb);
          }

          @keyframes slideUp {
            from { 
              opacity: 0;
              transform: translateY(30px);
            }
            to { 
              opacity: 1;
              transform: translateY(0);
            }
          }

          .modal-title {
            font-size: 28px;
            font-weight: 800;
            margin-bottom: 8px;
            color: #1a1a1a;
            letter-spacing: -0.5px;
          }

          .modal-subtitle {
            font-size: 16px;
            color: #666;
            margin-bottom: 30px;
            font-weight: 400;
          }

          .username-input {
            width: 100%;
            padding: 16px 20px;
            border: 2px solid #e5e7eb;
            border-radius: 16px;
            font-size: 16px;
            margin-bottom: 20px;
            outline: none;
            transition: all 0.3s ease;
            font-family: 'Inter', sans-serif;
            background: #fafafa;
          }

          .username-input:focus {
            border-color: #667eea;
            background: white;
            box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
          }

          .join-button {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 16px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: 'Inter', sans-serif;
            position: relative;
            overflow: hidden;
          }

          .join-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
          }

          .join-button:active {
            transform: translateY(0);
          }

          .join-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
          }

          .chat-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: #f8fafc;
            font-family: 'Inter', sans-serif;
            overflow: hidden;
          }

          .chat-header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            color: white;
            padding: 20px 24px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            position: relative;
            overflow: hidden;
          }

          .chat-header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="70" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
          }

          .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            position: relative;
            z-index: 1;
          }

          .app-title {
            font-size: 24px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 12px;
            letter-spacing: -0.5px;
          }

          .header-info {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 14px;
          }

          .user-badge {
            background: rgba(255, 255, 255, 0.2);
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 600;
            backdrop-filter: blur(10px);
          }

          .online-count {
            background: #10b981;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }

          .users-section {
            background: white;
            border-bottom: 1px solid #e5e7eb;
            padding: 16px 24px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
          }

          .users-title {
            font-size: 14px;
            font-weight: 700;
            color: #374151;
            margin-bottom: 12px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }

          .users-list {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .user-chip {
            padding: 8px 16px;
            border-radius: 24px;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.3s ease;
            border: 2px solid transparent;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .user-chip:not(.selected) {
            background: #f3f4f6;
            color: #6b7280;
          }

          .user-chip:not(.selected):hover {
            background: #e5e7eb;
            transform: translateY(-1px);
          }

          .user-chip.selected {
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: white;
            border-color: #1d4ed8;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
          }

          .no-users {
            color: #9ca3af;
            font-style: italic;
            font-size: 14px;
          }

          .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 0;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          }

          .system-message {
            display: flex;
            justify-content: center;
          }

          .system-message-content {
            padding: 12px 20px;
            border-radius: 20px;
            font-size: 13px;
            max-width: 400px;
            text-align: center;
            font-weight: 500;
          }

          .system-message-content.system {
            background: #f3f4f6;
            color: #6b7280;
            border: 1px solid #e5e7eb;
          }

          .system-message-content.error {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fecaca;
          }

          .message-time {
            font-size: 11px;
            color: #9ca3af;
            margin-top: 4px;
          }

          .media-message {
            display: flex;
            width: 100%;
            margin-bottom: 8px;
          }

          .media-message.sent {
            justify-content: flex-end;
          }

          .media-message.received {
            justify-content: flex-start;
          }

          .media-content {
            max-width: 400px;
            border-radius: 20px;
            padding: 16px;
            border: 1px solid #e5e7eb;
            position: relative;
            overflow: hidden;
            animation: messageSlideIn 0.3s ease-out;
          }

          @keyframes messageSlideIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .media-content.sent {
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white;
            border-color: #1d4ed8;
            box-shadow: 0 8px 25px rgba(59, 130, 246, 0.2);
          }

          .media-content.received {
            background: white;
            border-color: #e5e7eb;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          }

          .media-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            font-size: 12px;
            flex-wrap: wrap;
            gap: 8px;
          }

          .media-badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }

          .media-badge.sent-badge {
            background: #10b981;
            color: white;
          }

          .media-badge.received-badge {
            background: #f59e0b;
            color: white;
          }

          .media-preview img,
          .media-preview video {
            width: 100%;
            height: auto;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            max-height: 250px;
            object-fit: cover;
          }

          .media-preview audio {
            width: 100%;
            margin: 8px 0;
          }

          .file-preview {
            padding: 20px;
            background: rgba(0, 0, 0, 0.05);
            border-radius: 12px;
            text-align: center;
            border: 2px dashed rgba(0, 0, 0, 0.1);
            margin: 8px 0;
          }

          .file-icon {
            font-size: 32px;
            margin-bottom: 8px;
          }

          .file-name {
            font-size: 13px;
            font-weight: 600;
            word-break: break-word;
          }

          .media-time {
            font-size: 11px;
            opacity: 0.7;
            margin-top: 8px;
            text-align: right;
          }

          .send-form {
            background: white;
            border-top: 1px solid #e5e7eb;
            padding: 24px;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
          }

          .form-section {
            margin-bottom: 20px;
          }

          .form-label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .user-selector-container {
            position: relative;
          }

          .user-selector {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid #e5e7eb;
            border-radius: 12px;
            font-size: 14px;
            background: white;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .user-selector:hover {
            border-color: #d1d5db;
          }

          .user-selector.selected {
            border-color: #3b82f6;
            background: #eff6ff;
            color: #1d4ed8;
          }

          .dropdown-arrow {
            color: #9ca3af;
            transition: transform 0.3s ease;
          }

          .user-selector.open .dropdown-arrow {
            transform: rotate(180deg);
          }

          .user-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            margin-top: 4px;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            z-index: 100;
            max-height: 200px;
            overflow-y: auto;
            animation: dropdownSlide 0.2s ease-out;
          }

          @keyframes dropdownSlide {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .dropdown-item {
            width: 100%;
            padding: 12px 16px;
            text-align: left;
            border: none;
            background: none;
            cursor: pointer;
            transition: background-color 0.2s ease;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid #f3f4f6;
          }

          .dropdown-item:last-child {
            border-bottom: none;
          }

          .dropdown-item:hover {
            background: #f9fafb;
          }

          .dropdown-empty {
            padding: 16px;
            text-align: center;
            color: #9ca3af;
            font-size: 14px;
          }

          .clear-button {
            padding: 8px 16px;
            background: #f3f4f6;
            color: #6b7280;
            border: none;
            border-radius: 8px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-left: 12px;
          }

          .clear-button:hover {
            background: #e5e7eb;
          }

          .file-input-container {
            display: flex;
            align-items: flex-end;
            gap: 16px;
            flex-wrap: wrap;
          }

          .file-input-wrapper {
            flex: 1;
            min-width: 0;
          }

          .file-input {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid #e5e7eb;
            border-radius: 12px;
            font-size: 14px;
            background: white;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .file-input:hover {
            border-color: #d1d5db;
          }

          .file-input:focus {
            border-color: #3b82f6;
            outline: none;
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
          }

          .file-preview-thumb {
            width: 80px;
            height: 80px;
            border-radius: 12px;
            border: 2px solid #e5e7eb;
            object-fit: cover;
            background: #f9fafb;
          }

          .file-info {
            background: #f8fafc;
            padding: 16px;
            border-radius: 12px;
            text-align: center;
            font-size: 13px;
            color: #6b7280;
            border: 1px solid #e5e7eb;
          }

          .send-button {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 16px;
            position: relative;
            overflow: hidden;
          }

          .send-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
          }

          .send-button:active {
            transform: translateY(0);
          }

          @media (max-width: 768px) {
            .chat-messages {
              padding: 16px;
            }
            
            .send-form {
              padding: 16px;
            }
            
            .header-content {
              flex-direction: column;
              gap: 12px;
            }
            
            .app-title {
              font-size: 20px;
            }
            
            .file-input-container {
              flex-direction: column;
            }
            
            .file-preview-thumb {
              width: 60px;
              height: 60px;
            }
          }

          /* Scrollbar styling */
          .chat-messages::-webkit-scrollbar,
          .user-dropdown::-webkit-scrollbar {
            width: 6px;
          }

          .chat-messages::-webkit-scrollbar-track,
          .user-dropdown::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
          }

          .chat-messages::-webkit-scrollbar-thumb,
          .user-dropdown::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 3px;
          }

          .chat-messages::-webkit-scrollbar-thumb:hover,
          .user-dropdown::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
          }
        `}</style>
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="modal-title">Welcome to Ultra Media Chat! 👋</h2>
            <p className="modal-subtitle">Please enter your username to get started</p>
            <input
              type="text"
              placeholder="Enter your username..."
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              className="username-input"
              onKeyPress={(e) => e.key === 'Enter' && handleUsernameSubmit()}
              autoFocus
            />
            <button
              onClick={handleUsernameSubmit}
              className="join-button"
              disabled={!tempUsername.trim()}
            >
              Join Chat
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }
      `}</style>
      
      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="header-content">
            <h1 className="app-title">
              🚀 Ultra Media Chat
            </h1>
            <div className="header-info">
              <div className="user-badge">
                {username}
              </div>
              <div className="online-count">
                {onlineUsers.length} online
              </div>
            </div>
          </div>
        </div>

        {/* Online Users Section */}
        <div className="users-section">
          <div className="users-title">
            Online Users ({availableUsers.length})
          </div>
          <div className="users-list">
            {availableUsers.map((user) => (
              <div
                key={user.socketId}
                className={`user-chip ${targetUser === user.username ? 'selected' : ''}`}
                onClick={() => handleUserSelect(user.username)}
              >
                🟢 {user.username}
              </div>
            ))}
            {availableUsers.length === 0 && (
              <div className="no-users">No other users online</div>
            )}
          </div>
        </div>

        {/* Chat Messages Area */}
        <div className="chat-messages">
          {/* System Messages */}
          {messages.map((message, index) => (
            <div key={`msg-${index}`} className="system-message">
              <div className={`system-message-content ${message.type}`}>
                {message.content}
                <div className="message-time">
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))}

          {/* All Media */}
          {allMedia.map((media, index) => (
            <div
              key={`media-${index}`}
              className={`media-message ${media.type}`}
            >
              <div className={`media-content ${media.type}`}>
                <div className="media-header">
                  <div>
                    <span className={`media-badge ${media.type === 'sent' ? 'sent-badge' : 'received-badge'}`}>
                      {media.type === 'sent' ? 'SENT' : 'RECEIVED'}
                    </span>
                    <strong style={{ marginLeft: '8px' }}>{media.id}</strong>
                  </div>
                  <div>{formatBufferSize(media.size)}</div>
                </div>
                
                {/* Media Preview */}
                <div className="media-preview">
                  {media.mediaType.startsWith('image/') && media.url && (
                    <img
                      src={media.url}
                      alt={media.filename}
                    />
                  )}
                  
                  {media.mediaType.startsWith('video/') && media.url && (
                    <video
                      src={media.url}
                      controls
                    />
                  )}
                  
                  {media.mediaType.startsWith('audio/') && media.url && (
                    <audio
                      src={media.url}
                      controls
                    />
                  )}
                  
                  {!media.mediaType.startsWith('image/') && 
                   !media.mediaType.startsWith('video/') && 
                   !media.mediaType.startsWith('audio/') && (
                    <div className="file-preview">
                      <div className="file-icon">
                        {getMediaIcon(media.mediaType)}
                      </div>
                      <div className="file-name">
                        {media.filename}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="media-time">
                  {formatTime(media.timestamp)}
                </div>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Send Media Form */}
        <div className="send-form">
          {/* User Selection */}
          <div className="form-section">
            <label className="form-label">📤 Send to:</label>
            <div className="user-selector-container" ref={dropdownRef}>
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className={`user-selector ${targetUser ? 'selected' : ''} ${showUserDropdown ? 'open' : ''}`}
              >
                <span>{targetUser || 'Select a user...'}</span>
                <span className="dropdown-arrow">▼</span>
              </button>
              
              {showUserDropdown && (
                <div className="user-dropdown">
                  {availableUsers.length > 0 ? (
                    availableUsers.map((user) => (
                      <button
                        key={user.socketId}
                        onClick={() => handleUserSelect(user.username)}
                        className="dropdown-item"
                      >
                        🟢 {user.username}
                      </button>
                    ))
                  ) : (
                    <div className="dropdown-empty">
                      No users available
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {targetUser && (
              <button
                onClick={clearTargetUser}
                className="clear-button"
              >
                Clear
              </button>
            )}
          </div>

          {/* File Selection */}
          <div className="form-section">
            <label className="form-label">📎 Select Media:</label>
            <div className="file-input-container">
              <div className="file-input-wrapper">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  onChange={handleMediaChange}
                  className="file-input"
                />
              </div>
              {newMediaPreview && (
                mediaType.startsWith('image/') ? (
                  <img src={newMediaPreview} alt="Preview" className="file-preview-thumb" />
                ) : mediaType.startsWith('video/') ? (
                  <video src={newMediaPreview} className="file-preview-thumb" muted />
                ) : null
              )}
            </div>
          </div>

          {/* File Info */}
          {bufferSize !== null && (
            <div className="file-info">
              📊 File size: <strong>{formatBufferSize(bufferSize)}</strong>
              {newMedia && (
                <>
                  {' • '}
                  {getMediaIcon(mediaType)} <strong>{newMedia.filename}</strong>
                </>
              )}
            </div>
          )}

          {/* Send Button */}
          {newMedia && targetUser.trim().length > 0 && (
            <button 
              onClick={handleMediaSend} 
              className="send-button"
            >
              🚀 Send Media to {targetUser}
            </button>
          )}
        </div>
      </div>
    , 0, 0.8);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-content {
          background: white;
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
          max-width: 450px;
          width: 100%;
          text-align: center;
          animation: slideUp 0.4s ease-out;
          position: relative;
          overflow: hidden;
        }

        .modal-content::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #667eea, #764ba2, #f093fb);
        }

        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translateY(30px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }

        .modal-title {
          font-size: 28px;
          font-weight: 800;
          margin-bottom: 8px;
          color: #1a1a1a;
          letter-spacing: -0.5px;
        }

        .modal-subtitle {
          font-size: 16px;
          color: #666;
          margin-bottom: 30px;
          font-weight: 400;
        }

        .username-input {
          width: 100%;
          padding: 16px 20px;
          border: 2px solid #e5e7eb;
          border-radius: 16px;
          font-size: 16px;
          margin-bottom: 20px;
          outline: none;
          transition: all 0.3s ease;
          font-family: 'Inter', sans-serif;
          background: #fafafa;
        }

        .username-input:focus {
          border-color: #667eea;
          background: white;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
        }

        .join-button {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          font-family: 'Inter', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .join-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
        }

        .join-button:active {
          transform: translateY(0);
        }

        .join-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #f8fafc;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }

        .chat-header {
          background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
          color: white;
          padding: 20px 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
          position: relative;
          overflow: hidden;
        }

        .chat-header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="70" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
        }

        .header-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          position: relative;
          z-index: 1;
        }

        .app-title {
          font-size: 24px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 12px;
          letter-spacing: -0.5px;
        }

        .header-info {
          display: flex;
          align-items: center;
          gap: 16px;
          font-size: 14px;
        }

        .user-badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          backdrop-filter: blur(10px);
        }

        .online-count {
          background: #10b981;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .users-section {
          background: white;
          border-bottom: 1px solid #e5e7eb;
          padding: 16px 24px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
        }

        .users-title {
          font-size: 14px;
          font-weight: 700;
          color: #374151;
          margin-bottom: 12px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .users-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .user-chip {
          padding: 8px 16px;
          border-radius: 24px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s ease;
          border: 2px solid transparent;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .user-chip:not(.selected) {
          background: #f3f4f6;
          color: #6b7280;
        }

        .user-chip:not(.selected):hover {
          background: #e5e7eb;
          transform: translateY(-1px);
        }

        .user-chip.selected {
          background: linear-gradient(135deg, #3b82f6, #1d4ed8);
          color: white;
          border-color: #1d4ed8;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .no-users {
          color: #9ca3af;
          font-style: italic;
          font-size: 14px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-height: 0;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }

        .system-message {
          display: flex;
          justify-content: center;
        }

        .system-message-content {
          padding: 12px 20px;
          border-radius: 20px;
          font-size: 13px;
          max-width: 400px;
          text-align: center;
          font-weight: 500;
        }

        .system-message-content.system {
          background: #f3f4f6;
          color: #6b7280;
          border: 1px solid #e5e7eb;
        }

        .system-message-content.error {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }

        .message-time {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 4px;
        }

        .media-message {
          display: flex;
          width: 100%;
          margin-bottom: 8px;
        }

        .media-message.sent {
          justify-content: flex-end;
        }

        .media-message.received {
          justify-content: flex-start;
        }

        .media-content {
          max-width: 400px;
          border-radius: 20px;
          padding: 16px;
          border: 1px solid #e5e7eb;
          position: relative;
          overflow: hidden;
          animation: messageSlideIn 0.3s ease-out;
        }

        @keyframes messageSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .media-content.sent {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          border-color: #1d4ed8;
          box-shadow: 0 8px 25px rgba(59, 130, 246, 0.2);
        }

        .media-content.received {
          background: white;
          border-color: #e5e7eb;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }

        .media-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 12px;
          flex-wrap: wrap;
          gap: 8px;
        }

        .media-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .media-badge.sent-badge {
          background: #10b981;
          color: white;
        }

        .media-badge.received-badge {
          background: #f59e0b;
          color: white;
        }

        .media-preview img,
        .media-preview video {
          width: 100%;
          height: auto;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          max-height: 250px;
          object-fit: cover;
        }

        .media-preview audio {
          width: 100%;
          margin: 8px 0;
        }

        .file-preview {
          padding: 20px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 12px;
          text-align: center;
          border: 2px dashed rgba(0, 0, 0, 0.1);
          margin: 8px 0;
        }

        .file-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }

        .file-name {
          font-size: 13px;
          font-weight: 600;
          word-break: break-word;
        }

        .media-time {
          font-size: 11px;
          opacity: 0.7;
          margin-top: 8px;
          text-align: right;
        }

        .send-form {
          background: white;
          border-top: 1px solid #e5e7eb;
          padding: 24px;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
        }

        .form-section {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-selector-container {
          position: relative;
        }

        .user-selector {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 14px;
          background: white;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .user-selector:hover {
          border-color: #d1d5db;
        }

        .user-selector.selected {
          border-color: #3b82f6;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .dropdown-arrow {
          color: #9ca3af;
          transition: transform 0.3s ease;
        }

        .user-selector.open .dropdown-arrow {
          transform: rotate(180deg);
        }

        .user-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          z-index: 100;
          max-height: 200px;
          overflow-y: auto;
          animation: dropdownSlide 0.2s ease-out;
        }

        @keyframes dropdownSlide {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-item {
          width: 100%;
          padding: 12px 16px;
          text-align: left;
          border: none;
          background: none;
          cursor: pointer;
          transition: background-color 0.2s ease;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #f3f4f6;
        }

        .dropdown-item:last-child {
          border-bottom: none;
        }

        .dropdown-item:hover {
          background: #f9fafb;
        }

        .dropdown-empty {
          padding: 16px;
          text-align: center;
          color: #9ca3af;
          font-size: 14px;
        }

        .clear-button {
          padding: 8px 16px;
          background: #f3f4f6;
          color: #6b7280;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-left: 12px;
        }

        .clear-button:hover {
          background: #e5e7eb;
        }

        .file-input-container {
          display: flex;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
        }

        .file-input-wrapper {
          flex: 1;
          min-width: 0;
        }

        .file-input {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          font-size: 14px;
          background: white;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .file-input:hover {
          border-color: #d1d5db;
        }

        .file-input:focus {
          border-color: #3b82f6;
          outline: none;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }

        .file-preview-thumb {
          width: 80px;
          height: 80px;
          border-radius: 12px;
          border: 2px solid #e5e7eb;
          object-fit: cover;
          background: #f9fafb;
        }

        .file-info {
          background: #f8fafc;
          padding: 16px;
          border-radius: 12px;
          text-align: center;
          font-size: 13px;
          color: #6b7280;
          border: 1px solid #e5e7eb;
        }

        .send-button {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 16px;
          position: relative;
          overflow: hidden;
        }

        .send-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(59, 130, 246, 0.3);
        }

        .send-button:active {
          transform: translateY(0);
        }

        @media (max-width: 768px) {
          .chat-messages {
            padding: 16px;
          }
          
          .send-form {
            padding: 16px;
          }
          
          .header-content {
            flex-direction: column;
            gap: 12px;
          }
          
          .app-title {
            font-size: 20px;
          }
          
          .file-input-container {
            flex-direction: column;
          }
          
          .file-preview-thumb {
            width: 60px;
            height: 60px;
          }
        }

        /* Scrollbar styling */
        .chat-messages::-webkit-scrollbar,
        .user-dropdown::-webkit-scrollbar {
          width: 6px;
        }

        .chat-messages::-webkit-scrollbar-track,
        .user-dropdown::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 3px;
        }

        .chat-messages::-webkit-scrollbar-thumb,
        .user-dropdown::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 3px;
        }

        .chat-messages::-webkit-scrollbar-thumb:hover,
        .user-dropdown::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
