export interface WebSocketToken {
  access_token: string;
  expires_at: string;
  key_type: string;
}

export interface ValidateUserResponse {
  success: boolean;
  session_token: string;
  iframe_url: string;
}

// Use staging API by default, or override with env variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.scribemd.com';
const BEARER_TOKEN = process.env.NEXT_PUBLIC_BEARER_TOKEN || '';

/**
 * Fetch WebSocket token for transcription service
 * Calls the real ScribeMD API to get a WebSocket token
 */
export const fetchWebSocketToken = async (authToken?: string): Promise<WebSocketToken> => {
  // Use provided token or default bearer token
  const token = authToken || BEARER_TOKEN;
  const url = `${API_BASE_URL}/api/v1/auth/grant`;

  console.log('[fetchWebSocketToken] 📡 Starting token request...');
  console.log('[fetchWebSocketToken] URL:', url);
  console.log('[fetchWebSocketToken] Bearer token (first 20 chars):', token.substring(0, 20) + '...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'websocket',
      }),
    });

    console.log('[fetchWebSocketToken] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: {
        'content-type': response.headers.get('content-type'),
      }
    });

    if (!response.ok) {
      let errorData: any;
      const contentType = response.headers.get('content-type');

      try {
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
        } else {
          errorData = await response.text();
        }
      } catch (parseError) {
        errorData = 'Could not parse error response';
        console.error('[fetchWebSocketToken] Error parsing response:', parseError);
      }

      console.error('[fetchWebSocketToken] ❌ Request failed:', {
        status: response.status,
        statusText: response.statusText,
        url: url,
        errorData: errorData,
      });

      throw new Error(
        `Failed to fetch WebSocket token: ${response.status} ${response.statusText}. ` +
        `Error: ${typeof errorData === 'string' ? errorData : JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();

    console.log('[fetchWebSocketToken] ✅ Token received successfully:', {
      access_token: data.access_token?.substring(0, 20) + '...',
      expires_at: data.expires_at,
      key_type: data.key_type,
      full_response: data,
    });

    return data;
  } catch (error: unknown) {
    const errorObj = error as Error;
    console.error('[fetchWebSocketToken] ❌ Exception caught:', {
      name: errorObj.name,
      message: errorObj.message,
      stack: errorObj.stack,
      cause: errorObj.cause,
    });

    // Network error or fetch failed
    if (errorObj.name === 'TypeError' && errorObj.message.includes('fetch')) {
      throw new Error(
        `Network error: Could not reach ${url}. ` +
        `Please check your internet connection and ensure the API is accessible. ` +
        `Original error: ${errorObj.message}`
      );
    }

    // Re-throw if it's already our custom error
    if (errorObj.message.includes('Failed to fetch WebSocket token')) {
      throw error;
    }

    // Unknown error
    throw new Error(`Unexpected error fetching WebSocket token: ${errorObj.message}`);
  }
};

/**
 * Validate user and get iframe URL
 * Calls the ScribeMD API to validate user and get session token with iframe URL
 */
export const validateUser = async (email: string, photon_patient_id: string, photon_medical_record: string, photon_timestamp: string): Promise<ValidateUserResponse> => {
  const BEARER_TOKEN = process.env.NEXT_PUBLIC_BEARER_TOKEN || '';
  const url = 'https://www.scribemd.ai/ehrs/photon/validate_user';

  console.log('[validateUser] 📡 Starting validation request...');
  console.log('[validateUser] URL:', url);
  console.log('[validateUser] Email:', email);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BEARER_TOKEN}`,
      },
      body: JSON.stringify({
        email,
        photon_patient_id,
        photon_medical_record,
        photon_timestamp,
      }),
    });

    console.log('[validateUser] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      let errorData: any;
      const contentType = response.headers.get('content-type');

      try {
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
        } else {
          errorData = await response.text();
        }
      } catch (parseError) {
        errorData = 'Could not parse error response';
        console.error('[validateUser] Error parsing response:', parseError);
      }

      console.error('[validateUser] ❌ Request failed:', {
        status: response.status,
        statusText: response.statusText,
        url: url,
        errorData: errorData,
      });

      throw new Error(
        `Failed to validate user: ${response.status} ${response.statusText}. ` +
        `Error: ${typeof errorData === 'string' ? errorData : JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();

    console.log('[validateUser] ✅ Validation successful:', {
      success: data.success,
      session_token: data.session_token?.substring(0, 20) + '...',
      iframe_url: data.iframe_url,
    });

    return data;
  } catch (error: any) {
    console.error('[validateUser] ❌ Exception caught:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    // Network error or fetch failed
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Could not reach ${url}. ` +
        `Please check your internet connection and ensure the API is accessible. ` +
        `Original error: ${error.message}`
      );
    }

    // Re-throw if it's already our custom error
    if (error.message.includes('Failed to validate user')) {
      throw error;
    }

    // Unknown error
    throw new Error(`Unexpected error validating user: ${error.message}`);
  }
};
