export async function requestJson(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    });
    return await readApiResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The server took too long to respond. Please try again shortly.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function readApiResponse(response) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { /* Proxies can return empty or HTML error responses. */ }
  if (!response.ok) {
    if (typeof data?.error === 'string' && data.error.trim()) throw new Error(data.error);
    if (response.status === 429) throw new Error('Too many requests. Please wait a few minutes and try again.');
    if (response.status >= 500) throw new Error('The server is temporarily unavailable. Please try again shortly.');
    throw new Error('The request could not be completed. Please try again.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The server returned an incomplete response. Please try again.');
  }
  return data;
}
