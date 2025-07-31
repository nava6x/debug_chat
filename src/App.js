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

  // Available users excluding current user
  const availableUsers = onlineUsers.filter(user => user.username !== username);

  // Username setup modal
  if (!isUsernameSet) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-5">
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full text-center">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Welcome to Ultra Media Chat! 👋</h2>
          <p className="text-sm text-gray-600 mb-6">Please enter your username to get started</p>
          <input
            type="text"
            placeholder="Enter your username..."
            value={tempUsername}
            onChange={(e) => setTempUsername(e.target.value)}
            className="w-full p-3 border-2 border-gray-200 rounded-xl text-base mb-4 outline-none focus:border-blue-500 transition-colors"
            onKeyPress={(e) => e.key === 'Enter' && handleUsernameSubmit()}
            autoFocus
          />
          <button
            onClick={handleUsernameSubmit}
            className="w-full p-3 bg-blue-500 hover:bg-blue-600 text-white border-none rounded-xl text-base font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!tempUsername.trim()}
          >
            Join Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-600 text-white p-3 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
            🚀 Ultra Media Chat
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <div className="bg-white bg-opacity-20 px-3 py-1.5 rounded-full font-medium">
              {username}
            </div>
            <div className="bg-green-500 px-2 py-1 rounded-full text-xs font-semibold">
              {onlineUsers.length} online
            </div>
          </div>
        </div>
      </div>

      {/* Online Users Section */}
      <div className="bg-white border-b border-gray-200 p-3 flex-shrink-0">
        <div className="text-sm font-semibold text-gray-700 mb-2">
          Online Users ({availableUsers.length})
        </div>
        <div className="flex gap-2 flex-wrap">
          {availableUsers.map((user) => (
            <div
              key={user.socketId}
              className={`px-3 py-1.5 rounded-full text-xs cursor-pointer transition-all border ${
                targetUser === user.username
                  ? 'bg-blue-100 border-blue-500 text-blue-700'
                  : 'bg-gray-100 border-transparent text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => handleUserSelect(user.username)}
            >
              🟢 {user.username}
            </div>
          ))}
          {availableUsers.length === 0 && (
            <div className="text-gray-500 text-sm italic">No other users online</div>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        {/* System Messages */}
        {messages.map((message, index) => (
          <div key={`msg-${index}`} className="flex justify-center">
            <div className={`px-4 py-2 rounded-full text-sm max-w-xs text-center ${
              message.type === 'system' 
                ? 'bg-gray-100 text-gray-600 border border-gray-200' 
                : 'bg-red-50 text-red-600 border border-red-200'
            }`}>
              {message.content}
              <div className="text-xs text-gray-400 mt-1">
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {/* All Media */}
        {allMedia.map((media, index) => (
          <div
            key={`media-${index}`}
            className={`flex w-full ${
              media.type === 'sent' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div className={`max-w-sm rounded-2xl shadow-lg p-3 border ${
              media.type === 'sent' 
                ? 'bg-gradient-to-br from-blue-100 to-blue-200 border-blue-500' 
                : 'bg-white border-gray-200'
            }`}>
              <div className={`text-xs mb-2 flex justify-between items-center flex-wrap gap-1 ${
                media.type === 'sent' ? 'text-blue-800' : 'text-gray-600'
              }`}>
                <div>
                  <span className={`px-2 py-0.5 rounded text-white text-xs font-bold ${
                    media.type === 'sent' ? 'bg-green-500' : 'bg-yellow-500'
                  }`}>
                    {media.type === 'sent' ? 'SENT' : 'RECEIVED'}
                  </span>
                  <strong className="ml-1">{media.id}</strong>
                </div>
                <div>{formatBufferSize(media.size)}</div>
              </div>
              
              {/* Media Preview */}
              {media.mediaType.startsWith('image/') && media.url && (
                <img
                  src={media.url}
                  alt={media.filename}
                  className="w-full h-auto rounded-xl border border-gray-200 max-h-48 object-contain"
                />
              )}
              
              {media.mediaType.startsWith('video/') && media.url && (
                <video
                  src={media.url}
                  controls
                  className="w-full h-auto rounded-xl max-h-48"
                />
              )}
              
              {media.mediaType.startsWith('audio/') && media.url && (
                <audio
                  src={media.url}
                  controls
                  className="w-full"
                />
              )}
              
              {!media.mediaType.startsWith('image/') && 
               !media.mediaType.startsWith('video/') && 
               !media.mediaType.startsWith('audio/') && (
                <div className="p-4 bg-gray-50 rounded-xl text-center border-2 border-dashed border-gray-300">
                  <div className="text-3xl mb-2">
                    {getMediaIcon(media.mediaType)}
                  </div>
                  <div className="text-sm font-medium text-gray-700 break-words">
                    {media.filename}
                  </div>
                </div>
              )}
              
              <div className="text-xs text-gray-400 mt-2 text-right">
                {formatTime(media.timestamp)}
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Send Media Form */}
      <div className="bg-white border-t border-gray-200 p-4 shadow-lg flex-shrink-0">
        <div className="flex flex-col gap-3">
          {/* User Selection */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">📤 Send to:</label>
            <div className="flex-1 min-w-0 relative" ref={dropdownRef}>
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className={`w-full p-2.5 border-2 rounded-xl text-sm text-left flex items-center justify-between transition-colors ${
                  targetUser 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                <span>{targetUser || 'Select a user...'}</span>
                <span className="text-gray-400">▼</span>
              </button>
              
              {showUserDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                  {availableUsers.length > 0 ? (
                    availableUsers.map((user) => (
                      <button
                        key={user.socketId}
                        onClick={() => handleUserSelect(user.username)}
                        className="w-full p-2.5 text-left hover:bg-gray-50 transition-colors text-sm flex items-center gap-2 border-b border-gray-100 last:border-b-0"
                      >
                        🟢 {user.username}
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-gray-500 text-sm text-center">
                      No users available
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {targetUser && (
              <button
                onClick={clearTargetUser}
                className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* File Selection */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">📎 Select Media:</label>
              <input
                type="file"
                accept="*/*"
                onChange={handleMediaChange}
                className="w-full text-sm text-gray-600 p-2.5 border-2 border-gray-200 rounded-xl cursor-pointer bg-white hover:border-gray-300 transition-colors"
              />
            </div>
            {newMediaPreview && (
              mediaType.startsWith('image/') ? (
                <img src={newMediaPreview} alt="Preview" className="w-16 h-16 rounded-lg border-2 border-gray-200 object-cover" />
              ) : mediaType.startsWith('video/') ? (
                <video src={newMediaPreview} className="w-16 h-16 rounded-lg border-2 border-gray-200 object-cover" muted />
              ) : null
            )}
          </div>

          {/* File Info */}
          {bufferSize !== null && (
            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg text-center">
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
              className="p-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-none rounded-xl text-sm font-semibold cursor-pointer transition-all shadow-md hover:shadow-lg"
            >
              🚀 Send Media to {targetUser}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
