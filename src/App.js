import { useState, useEffect, useRef } from 'react';
import './style.css';

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

    // Mock socket for demo - replace with actual socket.io connection
    const mockSocket = {
      emit: (event, data) => {
        console.log('Mock emit:', event, data);
        // Simulate responses
        setTimeout(() => {
          if (event === 'user_join') {
            setMessages(prev => [...prev, {
              type: 'system',
              content: `Connected as ${username}`,
              timestamp: new Date()
            }]);
            // Mock online users
            setOnlineUsers([
              { username: username, socketId: 'user1' },
              { username: 'Alice', socketId: 'user2' },
              { username: 'Bob', socketId: 'user3' },
              { username: 'Charlie', socketId: 'user4' }
            ]);
          }
        }, 500);
      },
      on: () => {},
      close: () => {}
    };

    setSocket(mockSocket);
    mockSocket.emit('user_join', { username });

    return () => {
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
      <div className="login-overlay">
        <div className="login-modal">
          <div className="login-header">
            <div className="login-icon">💬</div>
            <h2>Welcome to Ultra Media Chat!</h2>
            <p>Enter your username to join the conversation</p>
          </div>
          <div className="login-form">
            <input
              type="text"
              placeholder="Enter your username..."
              value={tempUsername}
              onChange={(e) => setTempUsername(e.target.value)}
              className="login-input"
              onKeyPress={(e) => e.key === 'Enter' && handleUsernameSubmit()}
              autoFocus
            />
            <button
              onClick={handleUsernameSubmit}
              className={`login-button ${!tempUsername.trim() ? 'disabled' : ''}`}
              disabled={!tempUsername.trim()}
            >
              <span>🚀</span>
              Join Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="header-content">
          <div className="header-left">
            <div className="logo">
              <span className="logo-icon">💬</span>
              <h1>Ultra Media Chat</h1>
            </div>
          </div>
          <div className="header-right">
            <div className="user-badge">
              <span className="user-icon">👤</span>
              {username}
            </div>
            <div className="online-count">
              <span className="status-dot"></span>
              {onlineUsers.length} online
            </div>
          </div>
        </div>
      </div>

      {/* Online Users Section */}
      <div className="users-section">
        <div className="users-header">
          <span className="users-title">Connected Users ({availableUsers.length})</span>
          <div className="users-indicator">
            <span className="pulse-dot"></span>
          </div>
        </div>
        <div className="users-list">
          {availableUsers.map((user) => (
            <div
              key={user.socketId}
              className={`user-chip ${targetUser === user.username ? 'selected' : ''}`}
              onClick={() => handleUserSelect(user.username)}
            >
              <span className="user-status">🟢</span>
              <span className="user-name">{user.username}</span>
              {targetUser === user.username && <span className="selected-check">✓</span>}
            </div>
          ))}
          {availableUsers.length === 0 && (
            <div className="no-users">
              <span className="no-users-icon">👥</span>
              <span>Waiting for other users...</span>
            </div>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="messages-container">
        {/* System Messages */}
        {messages.map((message, index) => (
          <div key={`msg-${index}`} className="system-message">
            <div className={`system-bubble ${message.type}`}>
              <span className="system-icon">
                {message.type === 'system' ? '🔔' : '⚠️'}
              </span>
              <span className="system-text">{message.content}</span>
              <div className="system-time">
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {/* Media Messages */}
        {allMedia.map((media, index) => (
          <div
            key={`media-${index}`}
            className={`message-wrapper ${media.type === 'sent' ? 'sent' : 'received'}`}
          >
            <div className="message-bubble">
              <div className="message-header">
                <div className="message-info">
                  <span className={`message-status ${media.type}`}>
                    {media.type === 'sent' ? '📤 SENT' : '📥 RECEIVED'}
                  </span>
                  <span className="message-user">{media.id}</span>
                </div>
                <div className="message-size">{formatBufferSize(media.size)}</div>
              </div>
              
              {/* Media Content */}
              <div className="media-content">
                {media.mediaType.startsWith('image/') && media.url && (
                  <div className="image-container">
                    <img
                      src={media.url}
                      alt={media.filename}
                      className="media-image"
                    />
                    <div className="image-overlay">
                      <span className="image-filename">{media.filename}</span>
                    </div>
                  </div>
                )}
                
                {media.mediaType.startsWith('video/') && media.url && (
                  <div className="video-container">
                    <video
                      src={media.url}
                      controls
                      className="media-video"
                    />
                  </div>
                )}
                
                {media.mediaType.startsWith('audio/') && media.url && (
                  <div className="audio-container">
                    <div className="audio-icon">🎵</div>
                    <audio
                      src={media.url}
                      controls
                      className="media-audio"
                    />
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
                      <div className="file-name">{media.filename}</div>
                      <div className="file-type">{media.mediaType}</div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="message-time">
                {formatTime(media.timestamp)}
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Send Media Form */}
      <div className="send-section">
        <div className="send-container">
          {/* User Selection */}
          <div className="recipient-section">
            <label className="section-label">
              <span className="label-icon">📤</span>
              Send to:
            </label>
            <div className="recipient-selector" ref={dropdownRef}>
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className={`recipient-button ${targetUser ? 'selected' : ''}`}
              >
                <span className="recipient-text">
                  {targetUser ? (
                    <>
                      <span className="recipient-status">🟢</span>
                      {targetUser}
                    </>
                  ) : (
                    'Select recipient...'
                  )}
                </span>
                <span className={`dropdown-arrow ${showUserDropdown ? 'open' : ''}`}>▼</span>
              </button>
              
              {showUserDropdown && (
                <div className="recipient-dropdown">
                  {availableUsers.length > 0 ? (
                    availableUsers.map((user) => (
                      <button
                        key={user.socketId}
                        onClick={() => handleUserSelect(user.username)}
                        className="dropdown-option"
                      >
                        <span className="option-status">🟢</span>
                        <span className="option-name">{user.username}</span>
                      </button>
                    ))
                  ) : (
                    <div className="dropdown-empty">
                      <span className="empty-icon">👥</span>
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
                title="Clear selection"
              >
                ✕
              </button>
            )}
          </div>

          {/* File Selection */}
          <div className="file-section">
            <label className="section-label">
              <span className="label-icon">📎</span>
              Choose media:
            </label>
            <div className="file-input-container">
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                onChange={handleMediaChange}
                className="file-input"
                id="media-input"
              />
              <label htmlFor="media-input" className="file-input-label">
                <span className="file-input-icon">📁</span>
                <span className="file-input-text">
                  {newMedia ? newMedia.filename : 'Browse files...'}
                </span>
              </label>
            </div>
            
            {newMediaPreview && (
              <div className="preview-container">
                {mediaType.startsWith('image/') ? (
                  <img src={newMediaPreview} alt="Preview" className="preview-image" />
                ) : mediaType.startsWith('video/') ? (
                  <video src={newMediaPreview} className="preview-video" muted />
                ) : null}
              </div>
            )}
          </div>

          {/* File Info */}
          {bufferSize !== null && (
            <div className="file-info-bar">
              <div className="file-stats">
                <span className="stat-item">
                  <span className="stat-icon">📊</span>
                  <span className="stat-value">{formatBufferSize(bufferSize)}</span>
                </span>
                {newMedia && (
                  <span className="stat-item">
                    <span className="stat-icon">{getMediaIcon(mediaType)}</span>
                    <span className="stat-value">{newMedia.filename}</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Send Button */}
          {newMedia && targetUser.trim().length > 0 && (
            <button 
              onClick={handleMediaSend} 
              className="send-button"
            >
              <span className="send-icon">🚀</span>
              <span className="send-text">Send to {targetUser}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
