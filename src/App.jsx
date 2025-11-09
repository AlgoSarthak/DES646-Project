import React, { useState, useCallback } from 'react';


// --- Helper & Component Icon Definitions ---


const BrainCircuitIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 5a3 3 0 1 0-5.993.142" />
    <path d="M18.5 7.5a3.5 3.5 0 1 0-6.023 2.48" />
    <path d="M12.5 14.5a3.5 3.5 0 1 0-5.023 2.48" />
    <path d="M17 17a3 3 0 1 0-5.993.142" />
    <path d="M12 12v-2" />
    <path d="m14.5 10.5 1-1" />
    <path d="m9.5 12.5-1 1" />
    <path d="M14.5 16.5a1 1 0 1 0-2 0" />
    <path d="M5.5 11.5a1 1 0 1 0 0-2" />
  </svg>
);


const ImageIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);


const SparklesIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);


// --- NEW --- Icon for clearing the sketch
const XCircleIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </svg>
);


// --- Main Application Component ---


export default function App() {
  const [productConcept, setProductConcept] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  // --- NEW --- State for uploaded sketch
  const [sketch, setSketch] = useState(null); // Stores { mimeType, data }
  const [sketchPreview, setSketchPreview] = useState(null); // Stores URL for <img>
  const [storyboard, setStoryboard] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);


  // API Configuration
  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY; 
  // This model is for text generation, but can also take an image input
  const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  // --- MODIFIED --- This model is for image generation AND can take an image input
  const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${API_KEY}`;
  
  // --- API Call Functions with Exponential Backoff ---
  
  const exponentialBackoff = async (apiCall, maxRetries = 5) => {
    let delay = 1000; // 1 second
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error) {
            console.warn(`API call failed, retrying in ${delay}ms... (Attempt ${i + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
    throw new Error(`API call failed after ${maxRetries} attempts.`);
  };


  // --- MODIFIED --- Now accepts the sketch to send with the prompt
  const generateStoryboardScript = async (concept, audience, sketchData) => {
    const systemPrompt = `You are an expert creative director... (Your original system prompt)... Respond ONLY with a valid JSON array...`;
    
    // --- MODIFIED --- Build a dynamic parts array
    const userPromptParts = [
      { text: `Product Concept: "${concept}". Target Audience: "${audience}".` }
    ];


    if (sketchData) {
      userPromptParts.push({ text: "Please use this user-provided sketch as strong visual inspiration for the scenes:" });
      userPromptParts.push({
        inlineData: {
          mimeType: sketchData.mimeType,
          data: sketchData.data
        }
      });
    }


    const payload = {
      contents: [{ parts: userPromptParts }], // <-- Use the dynamic parts
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            // ... (your original schema) ...
            properties: {
              sceneNumber: { type: "INTEGER" },
              visualDescription: { type: "STRING" },
              voiceover: { type: "STRING" },
              onScreenText: { type: "STRING" },
            },
            required: ["sceneNumber", "visualDescription", "voiceover"],
          },
        },
      },
    };


    const apiCall = async () => {
        const response = await fetch(TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    };
    
    const result = await exponentialBackoff(apiCall);
    const rawJson = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) throw new Error("Failed to get a valid script from the AI.");
    return JSON.parse(rawJson);
  };


  // --- MODIFIED --- Completely new function for multimodal image generation
  const generateImage = async (prompt, sketchData) => {
    
    const parts = [
      { text: `Generate one single image. Create a cinematic, professional product video still, high resolution, dynamic lighting, based on this description: "${prompt}"` }
    ];


    if (sketchData) {
      parts.push({ text: "Use this sketch as a strong visual reference for composition and style:" });
      parts.push({
        inlineData: {
          mimeType: sketchData.mimeType,
          data: sketchData.data
        }
      });
    }
    
    const payload = { 
      contents: [{ parts: parts }],
      generationConfig: {
        // Ask the model to return exactly one image
        candidateCount: 1, 
        responseMimeType: "image/png"
      }
    };


    const apiCall = async () => {
      // Use the new IMAGE_API_URL
      const response = await fetch(IMAGE_API_URL, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    };


    const result = await exponentialBackoff(apiCall);
    // Parse the new response format
    const base64Data = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Data) throw new Error("Failed to generate an image.");
    return `data:image/png;base64,${base64Data}`;
  };


  // --- NEW --- Handler for file upload
  const handleSketchUpload = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setSketch(null);
      setSketchPreview(null);
      return;
    }


    // 1. Create a preview URL for the <img> tag
    setSketchPreview(URL.createObjectURL(file));


    // 2. Convert the file to Base64 for the API
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      // The result includes a prefix like "data:image/png;base64,"
      // We need to split it and save the data and the mimeType
      const base64String = reader.result;
      const mimeType = base64String.substring(base64String.indexOf(":") + 1, base64String.indexOf(";"));
      const data = base64String.split(',')[1];
      
      setSketch({
        mimeType: mimeType,
        data: data
      });
    };
  };


  // --- NEW --- Handler to clear the sketch
  const clearSketch = () => {
    setSketch(null);
    setSketchPreview(null);
    // Also clear the file input field
    document.getElementById('sketchUpload').value = null;
  };


  // --- Main Handler ---
  
  const handleGenerateStoryboard = useCallback(async () => {
    // --- MODIFIED --- Added sketch to validation
    if (!productConcept || !targetAudience) {
      setError("Please fill in all text fields.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setStoryboard([]);


    try {
      // --- MODIFIED --- Pass sketch to script generator
      const script = await generateStoryboardScript(productConcept, targetAudience, sketch);
      
      const initialStoryboard = script.map(scene => ({ ...scene, imageUrl: null, imageIsLoading: true }));
      setStoryboard(initialStoryboard);


      // Generate images sequentially
      for (let i = 0; i < script.length; i++) {
        // --- MODIFIED --- Pass sketch to image generator
        const imageUrl = await generateImage(script[i].visualDescription, sketch);
        setStoryboard(prev => prev.map((scene, index) => 
          index === i ? { ...scene, imageUrl, imageIsLoading: false } : scene
        ));
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
    // --- MODIFIED --- Add sketch to dependency array
  }, [productConcept, targetAudience, sketch]);
  
  // --- Individual Scene Regeneration ---


  const regenerateImage = useCallback(async (sceneIndex) => {
    const scene = storyboard[sceneIndex];
    if (!scene) return;
    
    setStoryboard(prev => prev.map((s, i) => i === sceneIndex ? { ...s, imageIsLoading: true, imageUrl: null } : s));


    try {
      // --- MODIFIED --- Pass sketch to image generator
      const imageUrl = await generateImage(scene.visualDescription, sketch);
      setStoryboard(prev => prev.map((s, i) => i === sceneIndex ? { ...s, imageUrl, imageIsLoading: false } : s));
    } catch (err) {
      console.error(err);
      setStoryboard(prev => prev.map((s, i) => i === sceneIndex ? { ...s, imageIsLoading: false } : s));
      setError(`Failed to regenerate image for scene ${scene.sceneNumber}.`);
    }
    // --- MODIFIED --- Add sketch to dependency array
  }, [storyboard, sketch]);


  return (
    <div className="bg-slate-900 min-h-screen text-slate-100 font-sans p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-2">
            <BrainCircuitIcon className="w-10 h-10 text-cyan-400"/>
            <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-500">
              AI Storyboard Assistant
            </h1>
          </div>
          <p className="text-slate-400 text-lg">
            Transform your product ideas into visual stories, instantly.
          </p>
        </header>


        <main>
          <div className="bg-slate-800/50 p-6 rounded-2xl shadow-lg border border-slate-700 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="productConcept" className="block text-sm font-medium text-slate-300 mb-2">Product Concept</label>
                <textarea
                  id="productConcept"
                  rows="4"
                  value={productConcept}
                  onChange={(e) => setProductConcept(e.target.value)}
                  placeholder="e.g., A mobile app that uses AI to create personalized bedtime stories for children."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                />
              </div>
              <div>
                <label htmlFor="targetAudience" className="block text-sm font-medium text-slate-300 mb-2">Target Audience</label>
                <textarea
                  id="targetAudience"
                  rows="4"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., Parents of children aged 4-8 who are looking for engaging, non-screen-time evening activities."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>


            {/* --- NEW --- Sketch Upload Section */}
            <div className="mb-6">
              <label htmlFor="sketchUpload" className="block text-sm font-medium text-slate-300 mb-2">
                (Optional) Upload Sketch
              </label>
              <input
                type="file"
                id="sketchUpload"
                accept="image/png, image/jpeg"
                onChange={handleSketchUpload}
                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4
                           file:rounded-lg file:border-0 file:text-sm file:font-semibold
                           file:bg-cyan-600 file:text-white hover:file:bg-cyan-500
                           file:transition-colors file:cursor-pointer"
              />
            </div>
            
            {/* --- NEW --- Sketch Preview Section */}
            {sketchPreview && (
              <div className="mb-6 relative w-48 mx-auto border-2 border-dashed border-slate-600 rounded-lg p-2">
                <img src={sketchPreview} alt="Sketch preview" className="w-full rounded" />
                <button
                  onClick={clearSketch}
                  className="absolute -top-2 -right-2 bg-slate-700 text-white rounded-full p-1
                             hover:bg-red-500 transition-colors"
                  title="Clear sketch"
                >
                  <XCircleIcon className="w-5 h-5" />
                </button>
              </div>
            )}


            <button
              onClick={handleGenerateStoryboard}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Storyboard...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-5 h-5" />
                  Generate Storyboard
                </>
              )}
            </button>
            {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
          </div>


          {storyboard.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {storyboard.map((scene, index) => (
                <div key={scene.sceneNumber} className="bg-slate-800 rounded-2xl overflow-hidden shadow-lg border border-slate-700 flex flex-col animate-fade-in">
                  <div className="aspect-video bg-slate-700/50 flex items-center justify-center relative">
                    {(scene.imageIsLoading) && (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-12 h-12 mb-2 animate-pulse" />
                        <p>Generating image...</p>
                      </div>
                    )}
                    {scene.imageUrl && <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="w-full h-full object-cover" />}
                    <span className="absolute top-2 left-2 bg-black/50 text-white text-xs font-bold py-1 px-2 rounded-full">SCENE {scene.sceneNumber}</span>
                    <button 
                        onClick={() => regenerateImage(index)}
                        disabled={scene.imageIsLoading}
                        className="absolute bottom-2 right-2 bg-black/50 hover:bg-cyan-500/80 text-white p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="Regenerate Image"
                    >
                        <SparklesIcon className="w-4 h-4"/>
                    </button>
                  </div>
                  <div className="p-4 flex-grow flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-cyan-400 mb-1">Visual Description</h3>
                        <p className="text-sm text-slate-300 mb-4 italic">"{scene.visualDescription}"</p>
                        
                        <h3 className="font-bold text-cyan-400 mb-1">Voiceover</h3>
                        <p className="text-sm text-slate-300 mb-4">"{scene.voiceover}"</p>
                    </div>
                    
                    {scene.onScreenText && (
                    <div className="mt-2 pt-2 border-t border-slate-700">
                        <h3 className="font-bold text-cyan-400 mb-1">On-Screen Text</h3>
                        <p className="text-2xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-slate-100 to-slate-300 p-2">
                          {scene.onScreenText}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
       <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
