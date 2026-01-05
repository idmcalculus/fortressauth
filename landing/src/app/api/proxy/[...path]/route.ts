import { type NextRequest, NextResponse } from 'next/server';

// Ports to try - server starts at 5000 and increments if port is busy (up to +10)
const PORTS_TO_TRY = [5000, 5001, 5002, 5003, 5004, 5005, 5006, 5007, 5008, 5009, 5010];

let cachedPort: number | null = null;
let lastCheck = 0;
const CACHE_TTL = 30000; // 30 seconds

async function discoverServerPort(): Promise<number | null> {
  const now = Date.now();
  if (cachedPort && now - lastCheck < CACHE_TTL) {
    return cachedPort;
  }

  for (const port of PORTS_TO_TRY) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);

      const response = await fetch(`http://localhost:${port}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as { status?: string };
        if (data.status === 'ok') {
          cachedPort = port;
          lastCheck = now;
          return port;
        }
      }
    } catch {
      // Continue to next port
    }
  }

  return null;
}

async function proxyRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
): Promise<NextResponse> {
  const port = await discoverServerPort();

  if (!port) {
    return NextResponse.json({ error: 'API server not available' }, { status: 503 });
  }

  const { path } = await params;
  const targetPath = path.join('/');
  const targetUrl = `http://localhost:${port}/${targetPath}`;

  const headers = new Headers(request.headers);
  headers.delete('host');

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      // @ts-expect-error - duplex is needed for streaming body
      duplex: 'half',
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('transfer-encoding');

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to proxy request' }, { status: 502 });
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context.params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context.params);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context.params);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context.params);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context.params);
}
