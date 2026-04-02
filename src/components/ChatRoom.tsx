import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import Peer from 'peerjs';
import { Phone, Video, Gamepad2, Copy, LogOut, Send, Image as ImageIcon, Mic, StopCircle, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import GameModal from './GameModal';

export default function ChatRoom({ user }: { user: User }) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [peer, setPeer] = useState<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [remotePeerId, setRemotePeerId] = useState<string>('');
  const [showGame, setShowGame] = useState(false);
  
  // Call state
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoCall, setIsVideoCall] = useState(false);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Room & Messages
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribeRoom = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoom(data);
        
        // Find remote peer ID
        const otherUserId = data.participants.find((id: string) => id !== user.uid);
        if (otherUserId && data.peerIds && data.peerIds[otherUserId]) {
          setRemotePeerId(data.peerIds[otherUserId]);
        }
      } else {
        navigate('/');
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`));

    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/messages`));

    return () => {
      unsubscribeRoom();
      unsubscribeMessages();
    };
  }, [roomId, user.uid, navigate]);

  // Initialize PeerJS
  useEffect(() => {
    const newPeer = new Peer();
    
    newPeer.on('open', async (id) => {
      setPeerId(id);
      setPeer(newPeer);
      
      // Update room with our peer ID
      if (roomId) {
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, {
          [`peerIds.${user.uid}`]: id
        });
      }
    });

    newPeer.on('call', (call) => {
      setIncomingCall(call);
    });

    return () => {
      newPeer.destroy();
    };
  }, [roomId, user.uid]);

  // Handle streams
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !roomId) return;

    const msgText = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        senderId: user.uid,
        text: msgText,
        type: 'text',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;

    // Check size (limit to 800KB for Firestore)
    if (file.size > 800 * 1024) {
      alert('File is too large. Please select a file under 800KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      let type = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      try {
        await addDoc(collection(db, 'rooms', roomId, 'messages'), {
          senderId: user.uid,
          fileData: base64,
          type,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error('Error sending file:', err);
      }
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (audioBlob.size > 800 * 1024) {
          alert('Voice note too long.');
          return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64 = event.target?.result as string;
          if (roomId) {
            await addDoc(collection(db, 'rooms', roomId, 'messages'), {
              senderId: user.uid,
              fileData: base64,
              type: 'audio',
              createdAt: serverTimestamp()
            });
          }
        };
        reader.readAsDataURL(audioBlob);
        
        // Stop tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const startCall = async (video: boolean) => {
    if (!peer || !remotePeerId) {
      alert('Other user is not connected yet.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      setLocalStream(stream);
      setIsVideoCall(video);
      setIsCalling(true);

      const call = peer.call(remotePeerId, stream, { metadata: { video } });
      setActiveCall(call);

      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
      });

      call.on('close', () => {
        endCall();
      });
    } catch (err) {
      console.error('Failed to get local stream', err);
      alert('Could not access camera/microphone.');
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;

    const isVideo = incomingCall.metadata?.video;
    setIsVideoCall(isVideo);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
      setLocalStream(stream);
      setIsCalling(true);
      
      incomingCall.answer(stream);
      setActiveCall(incomingCall);

      incomingCall.on('stream', (remoteStream: MediaStream) => {
        setRemoteStream(remoteStream);
      });

      incomingCall.on('close', () => {
        endCall();
      });
      
      setIncomingCall(null);
    } catch (err) {
      console.error('Failed to get local stream', err);
      alert('Could not access camera/microphone.');
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      incomingCall.close();
      setIncomingCall(null);
    }
  };

  const endCall = () => {
    if (activeCall) {
      activeCall.close();
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setActiveCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
  };

  const copyCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      alert('Room code copied to clipboard!');
    }
  };

  if (!room) {
    return <div className="flex h-screen items-center justify-center dark:bg-gray-950 dark:text-white">Loading...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100 font-sans dark:bg-gray-950 transition-colors duration-200">
      {/* Header */}
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm dark:bg-gray-900 dark:border-b dark:border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Room: {roomId}</h1>
          <button onClick={copyCode} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" title="Copy Room Code">
            <Copy className="h-5 w-5" />
          </button>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {room.participants.length}/2 Joined
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGame(true)} className="rounded-full p-3 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="Play Game">
            <Gamepad2 className="h-5 w-5" />
          </button>
          <button onClick={() => startCall(false)} className="rounded-full p-3 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="Voice Call">
            <Phone className="h-5 w-5" />
          </button>
          <button onClick={() => startCall(true)} className="rounded-full p-3 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="Video Call">
            <Video className="h-5 w-5" />
          </button>
          <button onClick={() => navigate('/')} className="rounded-full p-3 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20" title="Leave Room">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {showGame && roomId && (
        <GameModal roomId={roomId} userId={user.uid} onClose={() => setShowGame(false)} />
      )}

      {/* Main Content */}
      <div className="relative flex flex-1 overflow-hidden">
        
        {/* Chat Area */}
        <div className={clsx("flex flex-1 flex-col transition-all", isCalling ? "hidden md:flex md:w-1/3 md:border-r dark:border-gray-800" : "w-full")}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isMe = msg.senderId === user.uid;
                return (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className={clsx("flex", isMe ? "justify-end" : "justify-start")}
                  >
                    <div className={clsx("max-w-[75%] rounded-2xl px-4 py-2 shadow-sm", isMe ? "bg-blue-600 text-white rounded-tr-none dark:bg-blue-500" : "bg-white text-gray-800 rounded-tl-none dark:bg-gray-800 dark:text-gray-100")}>
                      {msg.type === 'text' && <p>{msg.text}</p>}
                      {msg.type === 'image' && <img src={msg.fileData} alt="Shared" className="max-w-full rounded-lg" />}
                      {msg.type === 'video' && <video src={msg.fileData} controls className="max-w-full rounded-lg" />}
                      {msg.type === 'audio' && <audio src={msg.fileData} controls className="max-w-full" />}
                      <span className={clsx("mt-1 block text-[10px]", isMe ? "text-blue-200" : "text-gray-400 dark:text-gray-500")}>
                        {msg.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="bg-white p-4 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] dark:bg-gray-900 dark:shadow-[0_-1px_3px_rgba(0,0,0,0.2)]">
            <form onSubmit={sendMessage} className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,audio/*" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
                <Paperclip className="h-5 w-5" />
              </button>
              
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 rounded-full border border-gray-300 bg-gray-50 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500"
              />
              
              {newMessage.trim() ? (
                <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
                  <Send className="h-5 w-5 ml-1" />
                </button>
              ) : (
                <button 
                  type="button" 
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={clsx("flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors", isRecording ? "bg-red-500 animate-pulse" : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600")}
                >
                  {isRecording ? <StopCircle className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              )}
            </form>
          </div>
        </div>

        {/* Call Area */}
        {isCalling && (
          <div className="flex flex-1 flex-col bg-gray-900 relative">
            {remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-white">
                Waiting for other user...
              </div>
            )}
            
            <div className="absolute bottom-4 right-4 h-48 w-32 overflow-hidden rounded-xl bg-gray-800 shadow-lg border-2 border-gray-700">
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
            </div>

            <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-4">
              <button onClick={endCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700">
                <Phone className="h-6 w-6 rotate-[135deg]" />
              </button>
            </div>
          </div>
        )}

        {/* Incoming Call Overlay */}
        {incomingCall && !isCalling && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-900"
            >
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                {incomingCall.metadata?.video ? <Video className="h-10 w-10 text-blue-600 animate-pulse dark:text-blue-400" /> : <Phone className="h-10 w-10 text-blue-600 animate-pulse dark:text-blue-400" />}
              </div>
              <h2 className="mb-8 text-2xl font-bold text-gray-800 dark:text-white">Incoming {incomingCall.metadata?.video ? 'Video' : 'Voice'} Call</h2>
              <div className="flex gap-6">
                <button onClick={rejectCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-transform hover:scale-110">
                  <Phone className="h-6 w-6 rotate-[135deg]" />
                </button>
                <button onClick={answerCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 transition-transform hover:scale-110">
                  <Phone className="h-6 w-6" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
