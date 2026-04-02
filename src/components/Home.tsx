import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, signInAnonymously, User } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from '../firebase';
import { Plus, LogIn, Users, Info, Moon, Sun, UserCircle, Waves, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';

export default function Home({ user }: { user: User | null }) {
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
  const navigate = useNavigate();

  const toggleDarkMode = () => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message);
    }
  };

  const handleGuestLogin = async () => {
    try {
      await signInAnonymously(auth);
    } catch (err: any) {
      console.error('Guest login error:', err);
      if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') {
        setError('Anonymous sign-in is disabled. Please enable it in the Firebase Console: Authentication -> Sign-in method -> Anonymous -> Enable.');
      } else {
        setError(err.message);
      }
    }
  };

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const createRoom = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    
    const roomId = generateCode();
    try {
      await setDoc(doc(db, 'rooms', roomId), {
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        participants: [user.uid],
        status: 'waiting',
        peerIds: {}
      });
      navigate(`/room/${roomId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomId}`);
      setError('Failed to create room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCode.trim()) return;
    
    setLoading(true);
    setError('');
    const code = joinCode.trim().toUpperCase();
    
    try {
      const roomRef = doc(db, 'rooms', code);
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) {
        setError('Room not found. Please check the code.');
        setLoading(false);
        return;
      }
      
      const roomData = roomSnap.data();
      
      if (roomData.participants.includes(user.uid)) {
        navigate(`/room/${code}`);
      } else if (roomData.participants.length >= 2) {
        setError('Room is full.');
      } else {
        await setDoc(roomRef, {
          participants: [...roomData.participants, user.uid],
          status: 'active'
        }, { merge: true });
        navigate(`/room/${code}`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `rooms/${code}`);
      setError('Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4 font-sans text-gray-900 transition-colors duration-200 dark:bg-gray-950 dark:text-gray-100">
      
      {/* Top right controls */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button 
          onClick={() => setShowInfo(true)}
          className="rounded-full bg-white p-2 text-gray-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700"
        >
          <Info className="h-5 w-5" />
        </button>
        <button 
          onClick={toggleDarkMode}
          className="rounded-full bg-white p-2 text-gray-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700"
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800"
      >
        <div className="bg-blue-600 p-8 text-center text-white dark:bg-blue-700">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
          >
            <Waves className="h-8 w-8 text-white" />
          </motion.div>
          <h1 className="text-3xl font-bold tracking-tight">Echo Room</h1>
          <p className="mt-2 text-blue-100">Private 1-on-1 chat & calls</p>
        </div>

        <div className="p-8">
          {!user ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="space-y-4 text-center"
            >
              <p className="mb-6 text-gray-600 dark:text-gray-400">Sign in or continue as guest to start connecting.</p>
              <button
                onClick={handleLogin}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus:ring-white dark:focus:ring-offset-gray-900"
              >
                <LogIn className="h-5 w-5" />
                Sign in with Google
              </button>
              <button
                onClick={handleGuestLogin}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-gray-700 dark:focus:ring-offset-gray-900"
              >
                <UserCircle className="h-5 w-5" />
                Continue as Guest
              </button>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div>
                <button
                  onClick={createRoom}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-70 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-gray-900"
                >
                  <Plus className="h-5 w-5" />
                  {loading ? 'Creating...' : 'Create New Room'}
                </button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-gray-500 dark:bg-gray-900 dark:text-gray-400">or join existing</span>
                </div>
              </div>

              <form onSubmit={joinRoom} className="space-y-4">
                <div>
                  <label htmlFor="code" className="sr-only">Room Code</label>
                  <input
                    type="text"
                    id="code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-lg font-medium tracking-widest text-gray-900 uppercase transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500/40"
                    maxLength={6}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || joinCode.length < 3}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:ring-gray-700 dark:focus:ring-offset-gray-900"
                >
                  <Users className="h-5 w-5" />
                  {loading ? 'Joining...' : 'Join Room'}
                </button>
              </form>
            </motion.div>
          )}

          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
            >
              {error}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">About Project</h2>
                <button 
                  onClick={() => setShowInfo(false)}
                  className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 text-gray-600 dark:text-gray-300">
                <p><strong>Echo Room</strong> is a private 1-on-1 communication platform.</p>
                <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-900/20">
                  <p className="font-medium text-blue-900 dark:text-blue-100">Sourav Shah</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">MCA Final Year Project</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
