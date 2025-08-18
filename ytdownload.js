// Copyright: JerryCoder
// Description: YouTube download handler that extracts MP4 (720p) links via Clipto API.

export default async function ytDownload(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  // Validate YouTube URL
  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
    return new Response(JSON.stringify({
      status: "error",
      error: "Missing or invalid Yoube URL"
    }, null, 2), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract video ID from URL
  const extractVideoId = (url) => {
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    return match ? match[1] : null;
  };
  const videoId = extractVideoId(url);

  let duration = null;
  let title = null;
  let thumbnail = null;
  let mp4 = null;

  // Try Clipto API for metadata and MP4 (720p)
  try {
    const csrfRes = await fetch('https://www.clipto.com/api/csrf', {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'referer': 'https://www.clipto.com/id/media-downloader/youtube-downloader'
      }
    });

    const csrfData = await csrfRes.json();
    const csrftoken = csrfData.token;
    const kuki = `XSRF-TOKEN=${csrftoken}`;

    const cliptoRes = await fetch('https://www.clipto.com/api/youtube', {
      method: 'POST',
      headers: {
        'x-xsrf-token': csrftoken,
        'cookie': kuki,
        'origin': 'https://www.clipto.com',
        'referer': 'https://www.clipto.com/id/media-downloader/youtube-downloader',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({ url })
    });

    const data = await cliptoRes.json();
    title = data.title;
    thumbnail = data.thumbnail;
    if (!duration && data.duration) duration = data.duration;

    // Pick MP4 with 720p quality
    const mp4WithAudio = data.medias.find(v =>
      v.ext === 'mp4' &&
      (v.quality === '720p' || v.quality === 'hd720') &&
      (v.is_audio === true || v.audioQuality)
    );
    if (mp4WithAudio) mp4 = mp4WithAudio.url;

  } catch {
    // Silently fail MP4 fetch
  }

  // If no MP4 found
  if (!mp4) {
    return new Response(JSON.stringify({
      status: "false",
      error: "Failed to extract 720p MP4 link"
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Build final JSON response
  const result = {
    status: "success",
    title,
    thumbnail,
    mp4,
    duration: duration ? Math.round(duration) + "s" : null,
    used: request.used || 4,
    remaining: request.remaining || 16,
    copyright: "Notty_Boy"
  };

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
