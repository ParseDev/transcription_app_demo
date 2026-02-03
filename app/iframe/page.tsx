'use client';

import { useState, useEffect } from 'react';
import { validateUser, ValidateUserResponse } from '@/lib/api';

interface CachedSession {
  response: ValidateUserResponse;
  timestamp: number;
  email: string;
}

const CACHE_KEY = 'photon_session_cache';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export default function IframePage() {
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<string | null>(null);

  const getCachedSession = (): CachedSession | null => {
    if (typeof window === 'undefined') return null;
    
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const session: CachedSession = JSON.parse(cached);
      const age = Date.now() - session.timestamp;

      if (age < CACHE_DURATION_MS) {
        return session;
      } else {
        // Cache expired, remove it
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
    } catch (error) {
      console.error('Error reading cache:', error);
      return null;
    }
  };

  const setCachedSession = (email: string, response: ValidateUserResponse) => {
    if (typeof window === 'undefined') return;
    
    try {
      const cache: CachedSession = {
        response,
        timestamp: Date.now(),
        email,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      console.log('Cached session:', cache);
    } catch (error) {
      console.error('Error caching session:', error);
    }
  };

  // Load cached session on mount
  useEffect(() => {
    const cached = getCachedSession();
    if (cached) {
      setIframeUrl(cached.response.iframe_url);
      setUsingCache(true);
      const ageMinutes = Math.floor((Date.now() - cached.timestamp) / 60000);
      setCacheInfo(`Using cached session (${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} old)`);
      console.log('Loaded cached session:', cached.response);
    }
  }, []);

  const handleValidateUser = async () => {
    const email = 'dror.roditti@sheba.health.gov.il';
    const photon_patient_id = '0058390766';
    const photon_medical_record = '27279264';
    const photon_timestamp = '1765210381905';

    // Check cache first
    const cached = getCachedSession();
    if (cached && cached.email === email) {
      const age = Date.now() - cached.timestamp;
      const ageMinutes = Math.floor(age / 60000);
      
      if (age < CACHE_DURATION_MS) {
        console.log('Using cached session, age:', ageMinutes, 'minutes');
        setIframeUrl(cached.response.iframe_url);
        setUsingCache(true);
        setCacheInfo(`Using cached session (${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''} old)`);
        setError(null);
        return;
      }
    }

    // Cache expired or doesn't exist, make new request
    setLoading(true);
    setError(null);
    setIframeError(null);
    setUsingCache(false);
    setCacheInfo(null);

    try {
      const response = await validateUser(email, photon_patient_id, photon_medical_record, photon_timestamp);
      
      if (response.success && response.iframe_url) {
        setIframeUrl(response.iframe_url);
        setCachedSession(email, response);
        setCacheInfo('New session created');
        console.log('Iframe URL set:', response.iframe_url);
      } else {
        setError('Validation failed: Invalid response');
      }
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to validate user');
      console.error('Validation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleIframeLoad = () => {
    console.log('Iframe loaded successfully');
    setIframeError(null);
  };

  const handleIframeError = () => {
    const errorMsg = 'Failed to load iframe content. This may be due to CORS restrictions or the iframe blocking localhost origins. Try using the network address instead of localhost.';
    console.error('Iframe load error');
    setIframeError(errorMsg);
  };

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">ScribeMD Iframe Integration</h1>
          <p className="text-foreground/70">Validate user and display embedded content</p>
        </div>

        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={handleValidateUser}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Loading...' : 'Validate User & Load Iframe'}
          </button>
          {cacheInfo && (
            <div className={`px-4 py-2 rounded-lg text-sm ${
              usingCache 
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' 
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
            }`}>
              {usingCache ? '✓' : '🔄'} {cacheInfo}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200 font-medium">Error:</p>
            <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
          </div>
        )}

        {iframeUrl && (
          <div className="mt-6 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden shadow-lg">
            <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">Embedded Content</p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                URL: <span className="font-mono text-xs">{iframeUrl}</span>
              </p>
            </div>
            {iframeError && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
                <p className="text-yellow-800 dark:text-yellow-200 font-medium text-sm">⚠️ Iframe Warning:</p>
                <p className="text-yellow-600 dark:text-yellow-300 text-xs mt-1">{iframeError}</p>
                <p className="text-yellow-600 dark:text-yellow-300 text-xs mt-2">
                  If you&apos;re using localhost, try accessing via the network address shown in your terminal.
                </p>
              </div>
            )}
            <div className="relative w-full" style={{ height: '800px' }}>
              <iframe
                src={iframeUrl}
                className="w-full h-full border-0"
                title="ScribeMD Embedded Content"
                allow="microphone; camera; fullscreen; autoplay; encrypted-media"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

