import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ExternalLink, 
  Trash2, 
  X, 
  LayoutGrid, 
  Loader2, 
  Globe,
  PlusCircle,
  AlertCircle,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { db } from './firebase';

// --- Types ---
interface Tile {
  id: string;
  title: string;
  url: string;
  color: string;
  createdAt: number;
}

interface Page {
  id: string;
  name: string;
  createdAt: number;
}

const COLORS = [
  'bg-blue-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500', 
  'bg-violet-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500'
];

export default function App() {
  const [pages, setPages] = useState<Page[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showPageModal, setShowPageModal] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', color: COLORS[0] });
  const [editingTileId, setEditingTileId] = useState<string | null>(null);
  const [pageName, setPageName] = useState('');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editPageName, setEditPageName] = useState('');
  const [configMissing, setConfigMissing] = useState(false);

  // Check if Firebase is configured
  useEffect(() => {
    // Basic check if apiKey is provided in firebase.ts (via env or hardcoded)
    // In this demo, we'll just check if the app can initialize
    try {
      // If we are here, firebase.ts already ran. 
      // We'll check if we can actually reach firestore later.
    } catch (e) {
      setConfigMissing(true);
    }
  }, []);

  // Subscribe to pages
  useEffect(() => {
    const q = query(collection(db, 'pages'), orderBy('createdAt', 'asc'));
    
    // Safety timeout: if it takes more than 3 seconds, stop loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pagesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Page));
      setPages(pagesData);
      
      if (pagesData.length === 0 && !snapshot.metadata.fromCache) {
        // Create initial page if none exist and not from cache
        const initialId = 'home';
        setDoc(doc(db, 'pages', initialId), {
          name: 'ראשי',
          createdAt: Date.now()
        });
      } else if (pagesData.length > 0 && !activePageId) {
        setActivePageId(pagesData[0].id);
      }
      
      // If we have data (even from cache), we can stop loading
      if (pagesData.length > 0 || !snapshot.metadata.fromCache) {
        setLoading(false);
        clearTimeout(timer);
      }
    }, (err) => {
      console.error("Firestore error:", err);
      if (err.code === 'permission-denied' || err.code === 'failed-precondition') {
        setConfigMissing(true);
      }
      setLoading(false);
      clearTimeout(timer);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [activePageId]);

  // Subscribe to tiles for active page
  useEffect(() => {
    if (!activePageId) return;

    const q = query(
      collection(db, 'pages', activePageId, 'tiles'), 
      orderBy('createdAt', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tilesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tile));
      setTiles(tilesData);
    });

    return () => unsubscribe();
  }, [activePageId]);

  const handleAddTile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePageId) return;
    
    const tileData = {
      ...form,
      createdAt: Date.now()
    };
    
    if (!tileData.url.startsWith('http')) {
      tileData.url = 'https://' + tileData.url;
    }

    // סגירה וניקוי מיידי של הממשק
    const currentEditingId = editingTileId;
    setForm({ title: '', url: '', color: COLORS[0] });
    setShowModal(false);
    setEditingTileId(null);
    setSyncing(true);
    
    // ביצוע השמירה ברקע בלי לחכות (await)
    const savePromise = currentEditingId
      ? setDoc(doc(db, 'pages', activePageId, 'tiles', currentEditingId), tileData, { merge: true })
      : addDoc(collection(db, 'pages', activePageId, 'tiles'), tileData);

    savePromise
      .catch(err => {
        console.error("Add/Update tile error:", err);
        alert("שגיאה בשמירת הקישור. הוא יישמר ברגע שהחיבור יתחדש.");
      })
      .finally(() => {
        setSyncing(false);
      });
  };

  const openEditModal = (tile: Tile) => {
    setForm({ title: tile.title, url: tile.url, color: tile.color });
    setEditingTileId(tile.id);
    setShowModal(true);
  };

  const handleAddPage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageName.trim()) return;
    
    const newName = pageName;
    setPageName('');
    setShowPageModal(false);
    setSyncing(true);
    
    // ביצוע השמירה ברקע
    addDoc(collection(db, 'pages'), {
      name: newName,
      createdAt: Date.now()
    })
    .then(docRef => {
      setActivePageId(docRef.id);
    })
    .catch(err => {
      console.error("Page creation error:", err);
      alert("שגיאה ביצירת קטגוריה.");
    })
    .finally(() => {
      setSyncing(false);
    });
  };

  const deleteTile = async (tileId: string) => {
    if (!activePageId) return;
    try {
      await deleteDoc(doc(db, 'pages', activePageId, 'tiles', tileId));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const deletePage = async (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // מונע מהקטגוריה להיבחר כשלוחצים על מחיקה
    if (!confirm('האם את בטוחה שברצונך למחוק את הקטגוריה הזו ואת כל הקישורים שבה?')) return;
    
    setSyncing(true);
    try {
      // מחיקת הקטגוריה עצמה
      await deleteDoc(doc(db, 'pages', pageId));
      
      // אם מחקנו את הקטגוריה הפעילה, נעבור לראשונה שנשארה
      if (activePageId === pageId) {
        setActivePageId(pages.find(p => p.id !== pageId)?.id || null);
      }
    } catch (err) {
      console.error("Delete page error:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdatePageName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPageId || !editPageName.trim()) return;
    
    setSyncing(true);
    try {
      await setDoc(doc(db, 'pages', editingPageId), { name: editPageName }, { merge: true });
      setEditingPageId(null);
    } catch (err) {
      console.error("Update page name error:", err);
    } finally {
      setSyncing(false);
    }
  };

  if (configMissing) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans p-6 text-center" dir="rtl">
      <div className="max-w-md bg-white p-8 rounded-[2rem] shadow-xl border border-rose-100">
        <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-4">נדרשת הגדרת Firebase</h2>
        <p className="text-slate-600 mb-6 leading-relaxed">
          כדי שהאפליקציה תעבוד ב-Vercel ותשמור את הנתונים שלך, עלייך להגדיר פרויקט ב-Firebase Console ולהוסיף את המפתחות לקובץ <code className="bg-slate-100 px-2 py-1 rounded text-rose-600">firebase.ts</code>.
        </p>
        <div className="text-sm text-slate-400">
          לאחר הוספת המפתחות, האפליקציה תתחבר אוטומטית.
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-bold">מתחבר ל-Firebase...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-100" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200 flex items-center justify-center transform hover:rotate-6 transition-transform">
            <LayoutGrid size={20} />
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight">הקישורים שלי</h1>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-bold px-3 py-1.5 rounded-full bg-green-50 text-green-600 border border-green-100 uppercase tracking-wider">
          <div className={`w-1 h-1 rounded-full ${syncing ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`}></div>
          {syncing ? 'מעדכן...' : 'מחובר'}
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b px-6 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {pages.map(page => (
          <div key={page.id} className="relative group flex-shrink-0">
            {editingPageId === page.id ? (
              <form onSubmit={handleUpdatePageName} className="flex items-center">
                <input
                  autoFocus
                  value={editPageName}
                  onChange={e => setEditPageName(e.target.value)}
                  onBlur={() => setEditingPageId(null)}
                  className="px-4 py-2 rounded-full text-xs font-bold bg-slate-100 border-2 border-blue-500 outline-none w-32"
                />
              </form>
            ) : (
              <button
                onClick={() => setActivePageId(page.id)}
                onDoubleClick={() => {
                  setEditingPageId(page.id);
                  setEditPageName(page.name);
                }}
                className={`px-6 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                  activePageId === page.id 
                  ? 'bg-slate-800 text-white shadow-md scale-105' 
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {page.name}
                {activePageId === page.id && (
                  <div className="flex items-center gap-1">
                    <Edit2 
                      size={12} 
                      className="text-blue-400 hover:text-blue-200 transition-colors" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPageId(page.id);
                        setEditPageName(page.name);
                      }}
                    />
                    <Trash2 
                      size={12} 
                      className="text-rose-400 hover:text-rose-200 transition-colors" 
                      onClick={(e) => deletePage(page.id, e)}
                    />
                  </div>
                )}
              </button>
            )}
          </div>
        ))}
        <button 
          onClick={() => setShowPageModal(true)}
          className="p-2 rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors flex-shrink-0"
        >
          <PlusCircle size={20} />
        </button>
      </nav>

      {/* Grid Content */}
      <main className="flex-1 p-6 md:p-10">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4 max-w-7xl mx-auto">
          {/* Add Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowModal(true)}
            className="aspect-square bg-white border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-all group shadow-sm"
          >
            <Plus size={24} />
            <span className="text-[9px] mt-1 font-bold uppercase tracking-widest">חדש</span>
          </motion.button>

          {/* Render Tiles */}
          <AnimatePresence mode="popLayout">
            {tiles.map(tile => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                key={tile.id} 
                className="relative aspect-square group"
              >
                <a
                  href={tile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${tile.color} w-full h-full rounded-2xl flex flex-col items-center justify-center p-3 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-center relative overflow-hidden`}
                >
                  <div className="absolute top-2 right-2 opacity-30 flex items-center justify-center">
                    <ExternalLink size={12} />
                  </div>
                  <span className="font-semibold text-[11px] md:text-xs leading-tight drop-shadow-sm line-clamp-3 px-1">
                    {tile.title}
                  </span>
                </a>
                <button
                  onClick={() => deleteTile(tile.id)}
                  className="absolute -top-1 -left-1 bg-white text-rose-500 p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-rose-50 border border-slate-100 flex items-center justify-center"
                >
                  <Trash2 size={12} />
                </button>
                <button
                  onClick={() => openEditModal(tile)}
                  className="absolute -top-1 -right-1 bg-white text-blue-500 p-1.5 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-blue-50 border border-slate-100 flex items-center justify-center"
                >
                  <Edit2 size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>

      {/* Tile Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2rem] p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">{editingTileId ? 'עריכת קישור' : 'הוספת קישור'}</h2>
                <button onClick={() => { setShowModal(false); setEditingTileId(null); setForm({ title: '', url: '', color: COLORS[0] }); }} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleAddTile} className="space-y-5">
                <div className="text-right">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 mr-1">שם האתר</label>
                  <input 
                    type="text" required autoFocus
                    value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-semibold text-slate-700 text-right"
                    placeholder="לדוגמה: גוגל"
                  />
                </div>
                
                <div className="text-right">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 mr-1">כתובת (URL)</label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input 
                      type="text" required dir="ltr"
                      value={form.url} onChange={e => setForm({...form, url: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 pl-10 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-slate-600 text-left"
                      placeholder="www.google.com"
                    />
                  </div>
                </div>

                <div className="text-right">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 mr-1">בחירת צבע</label>
                  <div className="flex justify-between gap-1.5">
                    {COLORS.map(c => (
                      <button
                        key={c} type="button"
                        onClick={() => setForm({...form, color: c})}
                        className={`${c} flex-1 h-7 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-slate-200 scale-110' : 'hover:scale-105'}`}
                      />
                    ))}
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={syncing}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-base shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all mt-2 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {syncing ? 'שומר...' : (editingTileId ? 'עדכן קישור' : 'הוסף ללוח')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Page Modal */}
      <AnimatePresence>
        {showPageModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[2rem] p-10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-slate-800">הוספת קטגוריה</h2>
                <button onClick={() => setShowPageModal(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleAddPage} className="space-y-6">
                <div className="text-right">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mr-1">שם הקטגוריה</label>
                  <input 
                    type="text" required autoFocus
                    value={pageName} onChange={e => setPageName(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl p-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-slate-700 text-right"
                    placeholder="לדוגמה: עבודה, פנאי..."
                  />
                </div>

                <button 
                  type="submit"
                  disabled={syncing}
                  className="w-full bg-slate-800 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-slate-100 hover:bg-slate-900 active:scale-95 transition-all mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {syncing ? 'יוצר...' : 'צור קטגוריה'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
