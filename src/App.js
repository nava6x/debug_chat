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
      setTargetUser(prev => prev === data.username ? '' : prev);
    });

    newSocket.on('online_users', (users) => {
      setOnlineUsers(users);
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
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  const availableUsers = onlineUsers.filter(user => user.username !== username);

  if (!isUsernameSet) {
    return (
      <div className="login-modal">
        <div className="login-container">
          <div className="login-header">
            <div className="login-icon">💬</div>
            <h2>Welcome to Ultra Media Chat</h2>
            <p>Connect and share media instantly</p>
          </div>
          <div className="login-form">
            <input
              type="text"
              placeholder="Enter your username..."
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleUsernameSubmit()}
              autoFocus
            />
            <button
              onClick={handleUsernameSubmit}
              disabled={!tempUsername.trim()}
            >
              <span>Join Chat</span>
              <div className="button-shine"></div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app">
      {/* Header */}
      <header className="chat-header">
        <div className="header-content">
          <div className="header-left">
            <div className="app-logo">
              <span className="logo-icon">🚀</span>
              <h1>Ultra Media Chat</h1>
            </div>
          </div>
          <div className="header-right">
            <div className="user-info">
              <div className="user-avatar">{username.charAt(0).toUpperCase()}</div>
              <span className="username">{username}</span>
            </div>
            <div className="online-count">
              <div className="online-dot"></div>
              <span>{onlineUsers.length} online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Online Users Section */}
      <div className="users-section">
        <div className="users-header">
          <span className="users-title">Online Users ({availableUsers.length})</span>
        </div>
        <div className="users-list">
          {availableUsers.map((user) => (
            <div
              key={user.socketId}
              className={`user-chip ${targetUser === user.username ? 'selected' : ''}`}
              onClick={() => handleUserSelect(user.username)}
            >
              <div className="user-status"></div>
              <span>{user.username}</span>
              {targetUser === user.username && <div className="selected-indicator">✓</div>}
            </div>
          ))}
          {availableUsers.length === 0 && (
            <div className="no-users">No other users online</div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        <div className="messages-container">
          {/* System Messages */}
          {messages.map((message, index) => (
            <div key={`msg-${index}`} className="system-message">
              <div className={`system-bubble ${message.type}`}>
                <span>{message.content}</span>
                <div className="message-time">{formatTime(message.timestamp)}</div>
              </div>
            </div>
          ))}

          {/* Media Messages */}
          {allMedia.map((media, index) => (
            <div
              key={`media-${index}`}
              className={`message-wrapper ${media.type}`}
            >
              <div className="message-bubble">
                <div className="message-header">
                  <div className="sender-info">
                    <span className={`message-type ${media.type}`}>
                      {media.type === 'sent' ? 'SENT' : 'RECEIVED'}
                    </span>
                    <span className="sender-name">{media.id}</span>
                  </div>
                  <div className="file-size">{formatBufferSize(media.size)}</div>
                </div>
                
                <div className="media-content">
                  {media.mediaType.startsWith('image/') && media.url && (
                    <div className="image-container">
                      <img src={media.url} alt={media.filename} />
                      <div className="image-overlay">
                        <span className="filename">{media.filename}</span>
                      </div>
                    </div>
                  )}
                  
                  {media.mediaType.startsWith('video/') && media.url && (
                    <div className="video-container">
                      <video src={media.url} controls />
                    </div>
                  )}
                  
                  {media.mediaType.startsWith('audio/') && media.url && (
                    <div className="audio-container">
                      <audio src={media.url} controls />
                      <div className="audio-info">
                        <span className="audio-icon">🎵</span>
                        <span className="filename">{media.filename}</span>
                      </div>
                    </div>
                  )}
                  
                  {!media.mediaType.startsWith('image/') && 
                   !media.mediaType.startsWith('video/') && 
                   !media.mediaType.startsWith('audio/') && (
                    <div className="file-container">
                      <div className="file-icon">
                        {getMediaIcon(media.mediaType)}
                      </div>
                      <div className="file-info">
                        <span className="filename">{media.filename}</span>
                        <span className="file-type">{media.mediaType}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="message-time">{formatTime(media.timestamp)}</div>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Media Input Section */}
      <div className="media-input-section">
        {/* Target User Selection */}
        <div className="target-user-section">
          <label>Send to:</label>
          <div className="user-selector" ref={dropdownRef}>
            <button
              className={`selector-button ${targetUser ? 'selected' : ''}`}
              onClick={() => setShowUserDropdown(!showUserDropdown)}
            >
              <span>{targetUser || 'Select a user...'}</span>
              <div className="dropdown-arrow">▼</div>
            </button>
            
            {showUserDropdown && (
              <div className="dropdown-menu">
                {availableUsers.length > 0 ? (
                  availableUsers.map((user) => (
                    <button
                      key={user.socketId}
                      className="dropdown-item"
                      onClick={() => handleUserSelect(user.username)}
                    >
                      <div className="user-status"></div>
                      <span>{user.username}</span>
                    </button>
                  ))
                ) : (
                  <div className="dropdown-empty">No users available</div>
                )}
              </div>
            )}
          </div>
          
          {targetUser && (
            <button className="clear-button" onClick={clearTargetUser}>
              ✕
            </button>
          )}
        </div>

        {/* File Selection */}
        <div className="file-section">
          <div className="file-input-container">
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              onChange={handleMediaChange}
              id="file-input"
            />
            <label htmlFor="file-input" className="file-input-label">
              <div className="file-input-icon">📎</div>
              <span>Choose Media File</span>
            </label>
          </div>
          
          {newMediaPreview && (
            <div className="preview-container">
              {mediaType.startsWith('image/') && (
                <img src={newMediaPreview} alt="Preview" className="preview-image" />
              )}
              {mediaType.startsWith('video/') && (
                <video src={newMediaPreview} className="preview-video" muted />
              )}
            </div>
          )}
        </div>

        {/* File Info */}
        {bufferSize !== null && (
          <div className="file-info-bar">
            <div className="file-details">
              <span className="file-icon">{getMediaIcon(mediaType)}</span>
              <span className="filename">{newMedia?.filename}</span>
              <span className="file-size">{formatBufferSize(bufferSize)}</span>
            </div>
          </div>
        )}

        {/* Send Button */}
        {newMedia && targetUser.trim().length > 0 && (
          <button className="send-button" onClick={handleMediaSend}>
            <span>🚀 Send to {targetUser}</span>
            <div className="button-ripple"></div>
          </button>
        )}
      </div>

      <style jsx>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .chat-app {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          overflow: hidden;
        }

        /* Login Modal */
        .login-modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .login-container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
          max-width: 400px;
          width: 100%;
          text-align: center;
          animation: modalSlideIn 0.3s ease-out;
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-30px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .login-header {
          margin-bottom: 30px;
        }

        .login-icon {
          font-size: 64px;
          margin-bottom: 20px;
          animation: bounce 2s infinite;
        }

        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-10px);
          }
          60% {
            transform: translateY(-5px);
          }
        }

        .login-header h2 {
          font-size: 28px;
          color: #333;
          margin-bottom: 8px;
          font-weight: 700;
        }

        .login-header p {
          color: #666;
          font-size: 16px;
        }

        .login-form input {
          width: 100%;
          padding: 16px 20px;
          border: 2px solid #e1e5e9;
          border-radius: 16px;
          font-size: 16px;
          margin-bottom: 20px;
          transition: all 0.3s ease;
          outline: none;
        }

        .login-form input:focus {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .login-form button {
          width: 100%;
          padding: 16px;
          background: linear-gradient(45deg, #667eea, #764ba2);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .login-form button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
        }

        .login-form button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button-shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s;
        }

        .login-form button:hover .button-shine {
          left: 100%;
        }

        /* Header */
        .chat-header {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding: 16px 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
        }

        .app-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          font-size: 28px;
          animation: rotate 3s linear infinite;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .app-logo h1 {
          font-size: 24px;
          color: #333;
          font-weight: 700;
          background: linear-gradient(45deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(102, 126, 234, 0.1);
          padding: 8px 16px;
          border-radius: 25px;
          border: 1px solid rgba(102, 126, 234, 0.2);
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          background: linear-gradient(45deg, #667eea, #764ba2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        }

        .username {
          font-weight: 600;
          color: #333;
        }

        .online-count {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(34, 197, 94, 0.1);
          padding: 8px 16px;
          border-radius: 25px;
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #16a34a;
          font-weight: 600;
          font-size: 14px;
        }

        .online-dot {
          width: 8px;
          height: 8px;
          background: #16a34a;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }

        /* Users Section */
        .users-section {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding: 16px 24px;
        }

        .users-header {
          margin-bottom: 12px;
        }

        .users-title {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .users-list {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .user-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.8);
          border: 2px solid transparent;
          border-radius: 25px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 14px;
          font-weight: 500;
          color: #333;
          position: relative;
          overflow: hidden;
        }

        .user-chip:hover {
          background: rgba(102, 126, 234, 0.1);
          border-color: rgba(102, 126, 234, 0.3);
          transform: translateY(-2px);
        }

        .user-chip.selected {
          background: linear-gradient(45deg, #667eea, #764ba2);
          color: white;
          border-color: transparent;
        }

        .user-status {
          width: 8px;
          height: 8px;
          background: #16a34a;
          border-radius: 50%;
          border: 2px solid white;
        }

        .selected-indicator {
          margin-left: 4px;
          font-weight: bold;
        }

        .no-users {
          color: #666;
          font-style: italic;
          font-size: 14px;
          padding: 12px 16px;
        }

        /* Chat Area */
        .chat-area {
          flex: 1;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.1);
        }

        .messages-container {
          height: 100%;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .messages-container::-webkit-scrollbar {
          width: 6px;
        }

        .messages-container::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }

        .messages-container::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
        }

        .messages-container::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }

        /* System Messages */
        .system-message {
          display: flex;
          justify-content: center;
          margin: 8px 0;
        }

        .system-bubble {
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          padding: 12px 20px;
          border-radius: 25px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          text-align: center;
          max-width: 300px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          animation: fadeInUp 0.3s ease-out;
        }

        .system-bubble.error {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.3);
          color: #dc2626;
        }

        .system-bubble span {
          font-size: 14px;
          font-weight: 500;
          color: #333;
        }

        .system-bubble .message-time {
          font-size: 11px;
          color: #666;
          margin-top: 4px;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Message Bubbles */
        .message-wrapper {
          display: flex;
          margin-bottom: 16px;
          animation: slideIn 0.3s ease-out;
        }

        .message-wrapper.sent {
          justify-content: flex-end;
        }

        .message-wrapper.received {
          justify-content: flex-start;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .message-bubble {
          max-width: 400px;
          border-radius: 20px;
          padding: 16px;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          position: relative;
          overflow: hidden;
        }

        .sent .message-bubble {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-bottom-right-radius: 5px;
        }

        .received .message-bubble {
          background: rgba(255, 255, 255, 0.95);
          color: #333;
          border-bottom-left-radius: 5px;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 12px;
        }

        .sender-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .message-type {
          padding: 3px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .message-type.sent {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .message-type.received {
          background: #16a34a;
          color: white;
        }

        .sender-name {
          font-weight: 600;
          font-size: 13px;
        }

        .file-size {
          font-size: 11px;
          opacity: 0.8;
          background: rgba(0, 0, 0, 0.1);
          padding: 2px 8px;
          border-radius: 10px;
        }

        /* Media Content */
        .media-content {
          margin-bottom: 12px;
        }

        .image-container {
          position: relative;
          border-radius: 12px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.05);
        }

        .image-container img {
          width: 100%;
          height: auto;
          max-height: 300px;
          object-fit: cover;
          display: block;
          transition: transform 0.3s ease;
        }

        .image-container:hover img {
          transform: scale(1.02);
        }

        .image-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
          color: white;
          padding: 12px;
          transform: translateY(100%);
          transition: transform 0.3s ease;
        }

        .image-container:hover .image-overlay {
          transform: translateY(0);
        }

        .video-container {
          border-radius: 12px;
          overflow: hidden;
          background: #000;
        }

        .video-container video {
          width: 100%;
          max-height: 300px;
          border-radius: 12px;
        }

        .audio-container {
          background: rgba(0, 0, 0, 0.05);
          border-radius: 12px;
          padding: 16px;
          text-align: center;
        }

        .audio-container audio {
          width: 100%;
          margin-bottom: 12px;
        }

        .audio-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .audio-icon {
          font-size: 20px;
        }

        .file-container {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 12px;
          padding: 20px;
          border: 2px dashed rgba(0, 0, 0, 0.1);
        }

        .file-icon {
          font-size: 32px;
          min-width: 40px;
          text-align: center;
        }

        .file-info {
          flex: 1;
          min-width: 0;
        }

        .filename {
          display: block;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
          word-break: break-all;
        }

        .file-type {
          font-size: 12px;
          opacity: 0.7;
          text-transform: uppercase;
        }

        .message-time {
          text-align: right;
          font-size: 11px;
          opacity: 0.7;
          margin-top: 8px;
        }

        /* Media Input Section */
        .media-input-section {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255, 255, 255, 0.2);
          padding: 24px;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
        }

        .target-user-section {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .target-user-section label {
          font-weight: 600;
          color: #333;
          font-size: 14px;
          min-width: fit-content;
        }

        .user-selector {
          position: relative;
          flex: 1;
          min-width: 200px;
        }

        .selector-button {
          width: 100%;
          padding: 12px 16px;
          background: white;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 14px;
        }

        .selector-button:hover {
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .selector-button.selected {
          border-color: #667eea;
          background: rgba(102, 126, 234, 0.05);
          color: #667eea;
          font-weight: 600;
        }

        .dropdown-arrow {
          transition: transform 0.3s ease;
          font-size: 10px;
          opacity: 0.6;
        }

        .selector-button:hover .dropdown-arrow {
          transform: translateY(-1px);
        }

        .dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
          z-index: 100;
          margin-top: 4px;
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
          background: none;
          border: none;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.2s ease;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          border-bottom: 1px solid #f3f4f6;
        }

        .dropdown-item:last-child {
          border-bottom: none;
        }

        .dropdown-item:hover {
          background: rgba(102, 126, 234, 0.05);
        }

        .dropdown-empty {
          padding: 16px;
          text-align: center;
          color: #666;
          font-style: italic;
          font-size: 14px;
        }

        .clear-button {
          padding: 8px 12px;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.3s ease;
          font-weight: 600;
        }

        .clear-button:hover {
          background: #dc2626;
          transform: translateY(-1px);
        }

        /* File Section */
        .file-section {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .file-input-container {
          flex: 1;
          min-width: 250px;
        }

        .file-input-container input[type="file"] {
          display: none;
        }

        .file-input-label {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          background: linear-gradient(45deg, #f8fafc, #e2e8f0);
          border: 2px dashed #cbd5e1;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-weight: 500;
          color: #475569;
        }

        .file-input-label:hover {
          border-color: #667eea;
          background: linear-gradient(45deg, #667eea, #764ba2);
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
        }

        .file-input-icon {
          font-size: 20px;
        }

        .preview-container {
          display: flex;
          gap: 12px;
        }

        .preview-image,
        .preview-video {
          width: 80px;
          height: 80px;
          object-fit: cover;
          border-radius: 12px;
          border: 3px solid #667eea;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }

        /* File Info Bar */
        .file-info-bar {
          background: linear-gradient(45deg, #f1f5f9, #e2e8f0);
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
          animation: slideInUp 0.3s ease-out;
        }

        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .file-details {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .file-details .file-icon {
          font-size: 24px;
        }

        .file-details .filename {
          font-weight: 600;
          color: #334155;
          flex: 1;
          min-width: 120px;
        }

        .file-details .file-size {
          background: #667eea;
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }

        /* Send Button */
        .send-button {
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(45deg, #667eea, #764ba2);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
          animation: buttonPulse 0.3s ease-out;
        }

        @keyframes buttonPulse {
          from {
            transform: scale(0.95);
          }
          to {
            transform: scale(1);
          }
        }

        .send-button:hover {
          transform: translateY(-3px);
          box-shadow: 0 15px 35px rgba(102, 126, 234, 0.4);
        }

        .send-button:active {
          transform: translateY(-1px);
        }

        .button-ripple {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transform: translate(-50%, -50%);
          transition: all 0.6s ease;
        }

        .send-button:active .button-ripple {
          width: 300px;
          height: 300px;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .header-content {
            padding: 0 16px;
          }
          
          .app-logo h1 {
            font-size: 20px;
          }
          
          .header-right {
            gap: 12px;
          }
          
          .user-info,
          .online-count {
            padding: 6px 12px;
            font-size: 12px;
          }
          
          .users-section,
          .media-input-section {
            padding: 16px;
          }
          
          .messages-container {
            padding: 16px;
          }
          
          .message-bubble {
            max-width: 280px;
          }
          
          .target-user-section {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          
          .target-user-section label {
            align-self: flex-start;
          }
          
          .file-section {
            flex-direction: column;
            align-items: stretch;
          }
          
          .file-input-container {
            min-width: auto;
          }
          
          .preview-container {
            align-self: center;
          }
        }

        @media (max-width: 480px) {
          .login-container {
            margin: 20px;
            padding: 30px 24px;
          }
          
          .chat-header {
            padding: 12px 16px;
          }
          
          .users-list {
            gap: 8px;
          }
          
          .user-chip {
            padding: 6px 12px;
            font-size: 12px;
          }
          
          .message-bubble {
            max-width: 240px;
            padding: 12px;
          }
          
          .file-details {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          
          .send-button {
            font-size: 14px;
            padding: 14px 20px;
          }
        }
      `}</style>
    </div>
  );
}
