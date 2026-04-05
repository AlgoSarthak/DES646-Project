import React, { useState, useEffect, useCallback } from 'react';

// --- Icon Definitions ---
const UserIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const SparklesIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>;
const HeartIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>;
const MessageCircleIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>;
const TrashIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>;
const CameraIcon = (props) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>;

// --- Constants & Config ---
const STORAGE_KEY = 'ai_social_avatar_demo';
const apiKey = ""; // API key is provided by the execution environment
const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;

// --- Helper Functions ---
const exponentialBackoff = async (apiCall, maxRetries = 5) => {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
};

// Safe LocalStorage Wrapper (Handles QuotaExceeded by trimming oldest posts)
const saveToStorage = (state) => {
  let currentState = { ...state };
  let saved = false;
  
  while (!saved) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
      saved = true;
    } catch (e) {
      if (currentState.feed && currentState.feed.length > 1) {
        console.warn("LocalStorage quota exceeded, trimming oldest post...");
        // Remove the oldest post (last item in the array, assuming unshift is used)
        currentState.feed = currentState.feed.slice(0, -1);
      } else {
        console.error("Storage completely full and cannot be trimmed further.", e);
        break; // Stop infinite loop if we can't trim anymore
      }
    }
  }
};

export default function App() {
  const [appState, setAppState] = useState({
    profile: null, // { name, handle, bio, visualTraits, profilePicUrl }
    feed: []       // [{ id, caption, imageUrl, timestamp, likes }]
  });
  
  const [setupPrompt, setSetupPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState(null);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setAppState(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse local storage", e);
      }
    }
  }, []);

  // Sync state to local storage whenever it changes
  useEffect(() => {
    if (appState.profile) {
      saveToStorage(appState);
    }
  }, [appState]);

  // --- API Handlers ---

  const generateTextJSON = async (prompt, systemInstruction, schema) => {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    };

    const apiCall = async () => {
      const res = await fetch(TEXT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Text API Error: ${res.status}`);
      return res.json();
    };

    const result = await exponentialBackoff(apiCall);
    return JSON.parse(result.candidates[0].content.parts[0].text);
  };

  const generateImageMedia = async (prompt) => {
    const payload = { 
      instances: { prompt: prompt },
      parameters: { sampleCount: 1 } 
    };

    const apiCall = async () => {
      const res = await fetch(IMAGE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`Image API Error: ${res.status}`);
      return res.json();
    };

    const result = await exponentialBackoff(apiCall);
    return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
  };

  // --- App Actions ---

  const handleCreateAvatar = async () => {
    if (!setupPrompt.trim()) return;
    setIsLoading(true);
    setError(null);
    
    try {
      setLoadingText('Dreaming up avatar personality...');
      
      const schema = {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          handle: { type: "STRING" },
          bio: { type: "STRING" },
          visualTraits: { type: "STRING", description: "Highly detailed physical description for an image generator prompt (e.g. '25yo female, pink bob hair, green eyes, wearing streetwear')" }
        },
        required: ["name", "handle", "bio", "visualTraits"]
      };
      
      const systemPrompt = "You create detailed, realistic personas for virtual social media influencers. Based on the user prompt, generate a cohesive identity.";
      const profileData = await generateTextJSON(`Create a persona based on this concept: ${setupPrompt}`, systemPrompt, schema);

      setLoadingText('Taking profile picture...');
      const pfpPrompt = `Close up portrait profile picture of ${profileData.visualTraits}, facing camera, modern lighting, high quality photography.`;
      const pfpUrl = await generateImageMedia(pfpPrompt);

      setAppState({
        profile: { ...profileData, profilePicUrl: pfpUrl },
        feed: []
      });
      setSetupPrompt('');

    } catch (err) {
      console.error(err);
      setError("Failed to create avatar. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateLifeEvent = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingText('Living life & writing caption...');

    try {
      const { profile, feed } = appState;
      
      // Pass recent history so they don't repeat the exact same activity
      const recentHistory = feed.slice(0, 3).map(p => p.caption).join(' | ');
      
      const schema = {
        type: "OBJECT",
        properties: {
          caption: { type: "STRING", description: "The social media caption for the post" },
          activityImagePrompt: { type: "STRING", description: "What are they doing in the photo? (e.g. 'drinking coffee at a modern cafe')" }
        },
        required: ["caption", "activityImagePrompt"]
      };

      const prompt = `You are ${profile.name} (@${profile.handle}). Your bio is: "${profile.bio}". 
      Write a new social media post about something you are doing right now. 
      Recent posts: [${recentHistory}]. 
      Make it feel candid, natural, and engaging. Include relevant emojis.`;

      const postConcept = await generateTextJSON(prompt, "You are a virtual influencer roleplaying your daily life.", schema);

      setLoadingText('Capturing the moment (Generating image)...');
      
      // CRITICAL: We inject the persistent visual traits into the image prompt to maintain identity consistency.
      const imagePrompt = `Candid social media photo, iPhone style. A photo of ${profile.visualTraits}. They are ${postConcept.activityImagePrompt}. Cinematic lighting, highly detailed.`;
      const photoUrl = await generateImageMedia(imagePrompt);

      const newPost = {
        id: crypto.randomUUID(),
        caption: postConcept.caption,
        imageUrl: photoUrl,
        timestamp: new Date().toISOString(),
        likes: Math.floor(Math.random() * 500) + 12
      };

      setAppState(prev => ({
        ...prev,
        // Prepend the new post. The saveToStorage function will trim it if it gets too large for localStorage.
        feed: [newPost, ...prev.feed] 
      }));

    } catch (err) {
      console.error(err);
      setError("Failed to generate life event. The network might be busy.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAppState({ profile: null, feed: [] });
  };

  // --- Views ---

  if (!appState.profile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-violet-500 to-fuchsia-500"></div>
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-slate-800 rounded-full text-fuchsia-400">
              <SparklesIcon className="w-10 h-10" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-center mb-2">Create Avatar</h1>
          <p className="text-center text-slate-400 mb-8 text-sm">Define a persona, and AI will generate their social media life.</p>
          
          <textarea
            value={setupPrompt}
            onChange={(e) => setSetupPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="e.g., A minimalist barista in Tokyo who loves analog photography and jazz..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent outline-none resize-none mb-6 text-sm min-h-[120px]"
          />
          
          {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
          
          <button
            onClick={handleCreateAvatar}
            disabled={isLoading || !setupPrompt.trim()}
            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all disabled:opacity-50 flex justify-center items-center gap-2"
          >
            {isLoading ? (
              <span className="flex items-center gap-2 animate-pulse">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {loadingText}
              </span>
            ) : (
              "Birth Avatar"
            )}
          </button>
        </div>
      </div>
    );
  }

  const { profile, feed } = appState;

  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-slate-800 p-4">
        <div className="max-w-lg mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400">
            AILife
          </h1>
          <button onClick={handleReset} className="text-slate-500 hover:text-red-400 transition-colors" title="Delete Avatar">
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto">
        {/* Profile Card */}
        <section className="bg-slate-900 border-b border-slate-800 p-6 flex flex-col items-center">
          <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-violet-500 to-fuchsia-500 mb-4 shadow-lg shadow-fuchsia-500/20">
             <img src={profile.profilePicUrl} alt={profile.name} className="w-full h-full rounded-full object-cover border-2 border-slate-900" />
          </div>
          <h2 className="text-2xl font-bold">{profile.name}</h2>
          <p className="text-slate-400 font-medium mb-3">@{profile.handle}</p>
          <p className="text-center text-sm text-slate-300 max-w-sm">{profile.bio}</p>
        </section>

        {/* Action Bar */}
        <section className="p-4 border-b border-slate-800 flex justify-center bg-slate-950 sticky top-[68px] z-40">
          <button 
            onClick={handleGenerateLifeEvent}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 px-6 rounded-full transition-all border border-slate-700 disabled:opacity-50"
          >
            {isLoading ? (
               <span className="flex items-center gap-2 animate-pulse text-sm">
                 <div className="w-4 h-4 border-2 border-fuchsia-400 border-t-transparent rounded-full animate-spin"></div>
                 {loadingText}
               </span>
            ) : (
              <>
                <CameraIcon className="w-5 h-5 text-fuchsia-400" />
                <span>Simulate Next Post</span>
              </>
            )}
          </button>
        </section>
        
        {error && <div className="p-4 bg-red-900/30 text-red-400 text-sm text-center border-b border-red-900/50">{error}</div>}

        {/* Feed */}
        <section className="flex flex-col">
          {feed.length === 0 && !isLoading && (
            <div className="text-center p-12 text-slate-500 flex flex-col items-center gap-3">
              <CameraIcon className="w-12 h-12 opacity-20" />
              <p>No posts yet. Simulate a life event!</p>
            </div>
          )}
          
          {feed.map((post) => (
            <article key={post.id} className="border-b border-slate-800 bg-slate-950 pb-4 animate-fade-in">
              <div className="flex items-center gap-3 p-4">
                 <img src={profile.profilePicUrl} alt="pfp" className="w-10 h-10 rounded-full object-cover" />
                 <div>
                   <h3 className="font-bold text-sm">{profile.name}</h3>
                   <p className="text-xs text-slate-500">
                     {new Date(post.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                   </p>
                 </div>
              </div>
              
              <div className="px-4 mb-3">
                <p className="text-sm whitespace-pre-wrap">{post.caption}</p>
              </div>
              
              <div className="w-full aspect-square bg-slate-900 border-y border-slate-800">
                <img src={post.imageUrl} alt="Generated post media" className="w-full h-full object-cover" />
              </div>
              
              <div className="px-4 pt-4 flex gap-6 text-slate-400">
                <button className="flex items-center gap-2 hover:text-pink-500 transition-colors">
                  <HeartIcon className="w-6 h-6" />
                  <span className="text-sm font-medium">{post.likes}</span>
                </button>
                <button className="flex items-center gap-2 hover:text-blue-400 transition-colors">
                  <MessageCircleIcon className="w-6 h-6" />
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
      
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}
