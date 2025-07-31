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
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [allMedia, messages]);

  // Check for stored username on component mount
  useEffect(() => {
    const storedUsername = localStorage.getItem('chatUsername');
    if (storedUsername) {
      setUsername(storedUsername);
      setIsUsernameSet(true);
    }
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
    });

    newSocket.on('online_users', (users) => {
      setOnlineUsers(users);
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
      localStorage.setItem('chatUsername', cleanUsername);
    }
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
      setTargetUser('');
      setMediaType('');
      document.querySelector('input[type="file"]').value = '';
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

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflow: 'hidden'
    },
    usernameModal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    },
    usernameCard: {
      backgroundColor: 'white',
      borderRadius: '16px',
      padding: '32px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      maxWidth: '400px',
      width: '100%',
      textAlign: 'center'
    },
    usernameTitle: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '8px',
      color: '#1f2937'
    },
    usernameSubtitle: {
      fontSize: '14px',
      color: '#6b7280',
      marginBottom: '24px'
    },
    usernameInput: {
      width: '100%',
      padding: '12px 16px',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      fontSize: '16px',
      marginBottom: '16px',
      outline: 'none',
      transition: 'border-color 0.2s'
    },
    usernameButton: {
      width: '100%',
      padding: '12px',
      backgroundColor: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'background-color 0.2s'
    },
    header: {
      backgroundColor: '#1e40af',
      background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
      color: 'white',
      padding: '12px 16px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      flexShrink: 0
    },
    headerContent: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px'
    },
    title: {
      fontSize: window.innerWidth < 480 ? '18px' : '20px',
      fontWeight: 'bold',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    userInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '14px'
    },
    username: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      padding: '6px 12px',
      borderRadius: '16px',
      fontWeight: '500'
    },
    onlineCount: {
      backgroundColor: '#10b981',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '600'
    },
    sidebar: {
      backgroundColor: 'white',
      borderBottom: '1px solid #e5e7eb',
      padding: '12px 16px',
      flexShrink: 0
    },
    onlineUsersTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#374151',
      marginBottom: '8px'
    },
    onlineUsersList: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap'
    },
    onlineUser: {
      backgroundColor: '#f3f4f6',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      color: '#374151',
      cursor: 'pointer',
      transition: 'all 0.2s',
      border: '1px solid transparent'
    },
    onlineUserSelected: {
      backgroundColor: '#dbeafe',
      borderColor: '#3b82f6',
      color: '#1d4ed8'
    },
    chatArea: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      minHeight: 0
    },
    mediaContainer: {
      display: 'flex',
      width: '100%'
    },
    mediaContainerSent: {
      justifyContent: 'flex-end'
    },
    mediaContainerReceived: {
      justifyContent: 'flex-start'
    },
    mediaCard: {
      maxWidth: window.innerWidth < 480 ? '280px' : '320px',
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      padding: '12px',
      position: 'relative',
      border: '1px solid #f1f5f9'
    },
    mediaCardSent: {
      background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
      borderColor: '#3b82f6'
    },
    mediaCardReceived: {
      backgroundColor: 'white',
      borderColor: '#e2e8f0'
    },
    mediaInfo: {
      fontSize: '12px',
      color: '#64748b',
      marginBottom: '8px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '4px'
    },
    mediaInfoSent: {
      color: '#1e40af'
    },
    mediaPreview: {
      width: '100%',
      height: 'auto',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      maxHeight: '200px',
      objectFit: 'contain'
    },
    videoPreview: {
      width: '100%',
      height: 'auto',
      borderRadius: '12px',
      maxHeight: '200px'
    },
    filePreview: {
      padding: '16px',
      backgroundColor: '#f8fafc',
      borderRadius: '12px',
      textAlign: 'center',
      border: '2px dashed #cbd5e1'
    },
    fileName: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
      marginTop: '8px',
      wordBreak: 'break-word'
    },
    timestamp: {
      fontSize: '10px',
      color: '#94a3b8',
      marginTop: '8px',
      textAlign: 'right'
    },
    messageContainer: {
      display: 'flex',
      width: '100%',
      justifyContent: 'center'
    },
    message: {
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '14px',
      maxWidth: '300px',
      textAlign: 'center'
    },
    messageSystem: {
      backgroundColor: '#f1f5f9',
      color: '#475569',
      border: '1px solid #e2e8f0'
    },
    messageError: {
      backgroundColor: '#fef2f2',
      color: '#dc2626',
      border: '1px solid #fecaca'
    },
    sendForm: {
      backgroundColor: 'white',
      borderTop: '1px solid #e5e7eb',
      padding: '16px',
      boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
      flexShrink: 0
    },
    formContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    targetUserSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap'
    },
    targetUserInput: {
      flex: 1,
      minWidth: '150px',
      padding: '8px 12px',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      fontSize: '14px',
      outline: 'none'
    },
    fileSection: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexWrap: window.innerWidth < 480 ? 'wrap' : 'nowrap'
    },
    fileInputContainer: {
      flex: 1,
      minWidth: window.innerWidth < 480 ? '100%' : '200px'
    },
    label: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#374151',
      display: 'block',
      marginBottom: '4px'
    },
    fileInput: {
      width: '100%',
      fontSize: '14px',
      color: '#6b7280',
      padding: '8px 12px',
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      cursor: 'pointer',
      backgroundColor: 'white'
    },
    preview: {
      maxWidth: '80px',
      maxHeight: '80px',
      borderRadius: '8px',
      border: '2px solid #e5e7eb',
      objectFit: 'cover'
    },
    bufferInfo: {
      fontSize: '12px',
      color: '#64748b',
      backgroundColor: '#f8fafc',
      padding: '8px 12px',
      borderRadius: '8px',
      textAlign: 'center'
    },
    sendButton: {
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      minWidth: '120px'
    },
    typeLabel: {
      fontSize: '10px',
      fontWeight: 'bold',
      padding: '2px 6px',
      borderRadius: '8px',
      color: 'white'
    },
    typeLabelSent: {
      backgroundColor: '#10b981'
    },
    typeLabelReceived: {
      backgroundColor: '#f59e0b'
    }
  };

  // Username setup modal
  if (!isUsernameSet) {
    return (
      <div style={styles.usernameModal}>
        <div style={styles.usernameCard}>
          <h2 style={styles.usernameTitle}>Welcome to Ultra Media Chat! 👋</h2>
          <p style={styles.usernameSubtitle}>Please enter your username to get started</p>
          <input
            type="text"
            placeholder="Enter your username..."
            value={tempUsername}
            onChange={(e) => setTempUsername(e.target.value)}
            style={styles.usernameInput}
            onKeyPress={(e) => e.key === 'Enter' && handleUsernameSubmit()}
            autoFocus
          />
          <button
            onClick={handleUsernameSubmit}
            style={styles.usernameButton}
            disabled={!tempUsername.trim()}
          >
            Join Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>
            🚀 Ultra Media Chat
          </h1>
          <div style={styles.userInfo}>
            <div style={styles.username}>{username}</div>
            <div style={styles.onlineCount}>
              {onlineUsers.length} online
            </div>
          </div>
        </div>
      </div>

      {/* Online Users */}
      <div style={styles.sidebar}>
        <div style={styles.onlineUsersTitle}>Online Users ({onlineUsers.length})</div>
        <div style={styles.onlineUsersList}>
          {onlineUsers.map((user) => (
            <div
              key={user.socketId}
              style={{
                ...styles.onlineUser,
                ...(targetUser === user.username ? styles.onlineUserSelected : {})
              }}
              onClick={() => setTargetUser(user.username)}
            >
              🟢 {user.username}
            </div>
          ))}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div style={styles.chatArea}>
        {/* System Messages */}
        {messages.map((message, index) => (
          <div key={`msg-${index}`} style={styles.messageContainer}>
            <div
              style={{
                ...styles.message,
                ...(message.type === 'system' ? styles.messageSystem : styles.messageError)
              }}
            >
              {message.content}
              <div style={styles.timestamp}>
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {/* All Media */}
        {allMedia.map((media, index) => (
          <div
            key={`media-${index}`}
            style={{
              ...styles.mediaContainer,
              ...(media.type === 'sent' ? styles.mediaContainerSent : styles.mediaContainerReceived)
            }}
          >
            <div
              style={{
                ...styles.mediaCard,
                ...(media.type === 'sent' ? styles.mediaCardSent : styles.mediaCardReceived)
              }}
            >
              <div style={{
                ...styles.mediaInfo,
                ...(media.type === 'sent' ? styles.mediaInfoSent : {})
              }}>
                <div>
                  <span style={{
                    ...styles.typeLabel,
                    ...(media.type === 'sent' ? styles.typeLabelSent : styles.typeLabelReceived)
                  }}>
                    {media.type === 'sent' ? 'SENT' : 'RECEIVED'}
                  </span>
                  <strong> {media.id}</strong>
                </div>
                <div>{formatBufferSize(media.size)}</div>
              </div>
              
              {/* Media Preview */}
              {media.mediaType.startsWith('image/') && media.url && (
                <img
                  src={media.url}
                  alt={media.filename}
                  style={styles.mediaPreview}
                />
              )}
              
              {media.mediaType.startsWith('video/') && media.url && (
                <video
                  src={media.url}
                  controls
                  style={styles.videoPreview}
                />
              )}
              
              {media.mediaType.startsWith('audio/') && media.url && (
                <audio
                  src={media.url}
                  controls
                  style={{ width: '100%' }}
                />
              )}
              
              {!media.mediaType.startsWith('image/') && 
               !media.mediaType.startsWith('video/') && 
               !media.mediaType.startsWith('audio/') && (
                <div style={styles.filePreview}>
                  <div style={{ fontSize: '32px' }}>
                    {getMediaIcon(media.mediaType)}
                  </div>
                  <div style={styles.fileName}>{media.filename}</div>
                </div>
              )}
              
              <div style={styles.timestamp}>
                {formatTime(media.timestamp)}
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Send Media Form */}
      <div style={styles.sendForm}>
        <div style={styles.formContent}>
          <div style={styles.targetUserSection}>
            <label style={styles.label}>📤 Send to:</label>
            <input
              type="text"
              placeholder="Username..."
              value={targetUser}
              onChange={(e) => setTargetUser(e.target.value)}
              style={styles.targetUserInput}
            />
          </div>

          <div style={styles.fileSection}>
            <div style={styles.fileInputContainer}>
              <label style={styles.label}>📎 Select Media:</label>
              <input
                type="file"
                accept="*/*"
                onChange={handleMediaChange}
                style={styles.fileInput}
              />
            </div>
            {newMediaPreview && (
              mediaType.startsWith('image/') ? (
                <img src={newMediaPreview} alt="Preview" style={styles.preview} />
              ) : mediaType.startsWith('video/') ? (
                <video src={newMediaPreview} style={styles.preview} muted />
              ) : null
            )}
          </div>

          {bufferSize !== null && (
            <div style={styles.bufferInfo}>
              📊 File size: <strong>{formatBufferSize(bufferSize)}</strong>
              {newMedia && (
                <>
                  {' • '}
                  {getMediaIcon(mediaType)} <strong>{newMedia.filename}</strong>
                </>
              )}
            </div>
          )}

          {newMedia && targetUser.trim().length > 0 && (
            <button onClick={handleMediaSend} style={styles.sendButton}>
              🚀 Send Media
            </button>
          )}
        </div>
      </div>
    </div>
  );
