import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

import { generateAuthToken, verifyAuthToken, revokeAuthToken } from './auth.js';

// Helper to parse JSON request body
const parseJsonBody = (req) => {
    console.log(`[REST] Parsing body for ${req.method} ${req.url}`);
    return new Promise((resolve, reject) => {
        if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
            console.log('[REST] Non-mutating request, skipping body parse');
            resolve({});
            return;
        }
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });
        req.on('end', () => {
            console.log(`[REST] Raw body parsed, length: ${body.length}`);
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                console.error('[REST] JSON parse error:', err);
                reject(new Error('Invalid JSON'));
            }
        });
    });
};

// Helper to send JSON response
const sendJson = (res, data, status = 200) => {
    console.log(`[REST] Sending response with status ${status}`);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end(JSON.stringify(data));
};

// Helper to authenticate request
const getAuthUser = async (req) => {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];
    const decoded = await verifyAuthToken(token);
    if (!decoded) {
        return null;
    }
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return null;
    return { user, token };
};

export async function restApiHandler(req, res, next) {
    try {
        const url = new URL(req.url, 'http://localhost');
        let path = url.pathname;

        // Support prefix stripping (connect usually strips, but fallback if not)
        if (path.startsWith('/api')) {
            path = path.slice(4);
        }
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }

        const method = req.method.toUpperCase();
        console.log(`[REST] Request received: ${method} ${path}`);

        // CORS preflight
        if (method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
            });
            res.end();
            return;
        }

        // 1. GET /AllIsGood
        if (path === '/AllIsGood' && method === 'GET') {
            return sendJson(res, {
                status: 'ok',
                message: 'All is good',
                timestamp: new Date().toISOString()
            });
        }

        // 2. POST /auth/signup
        if (path === '/auth/signup' && method === 'POST') {
            console.log('[REST] Handling signup...');
            const body = await parseJsonBody(req);
            console.log('[REST] Signup body parsed:', body);
            const { username, email, displayName } = body;
            if (!username || !email || !displayName) {
                return sendJson(res, { error: 'Username, email, and displayName are required' }, 400);
            }

            console.log('[REST] Database check for existing user...');
            const existingUser = await prisma.user.findFirst({
                where: { OR: [{ username }, { email }] }
            });
            console.log('[REST] Database check completed. User exists?', !!existingUser);
            if (existingUser) {
                return sendJson(res, { error: 'Username or email already exists' }, 400);
            }

            console.log('[REST] Creating user in database...');
            const user = await prisma.user.create({
                data: {
                    username,
                    email,
                    displayName,
                    profileImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
                }
            });
            console.log('[REST] User created:', user.id);

            console.log('[REST] Generating auth token...');
            const tokenString = await generateAuthToken(user);
            console.log('[REST] Token generated successfully');
            return sendJson(res, {
                token: {
                    accessToken: tokenString,
                    refreshToken: tokenString,
                    expiresIn: 3456000,
                    tokenType: 'Bearer'
                },
                user
            }, 201);
        }

        // 3. POST /auth/login
        if (path === '/auth/login' && method === 'POST') {
            const body = await parseJsonBody(req);
            const { username } = body;
            if (!username) {
                return sendJson(res, { error: 'Username is required' }, 400);
            }

            const user = await prisma.user.findUnique({ where: { username } });
            if (!user) {
                return sendJson(res, { error: 'Invalid credentials. User not found.' }, 401);
            }

            const tokenString = await generateAuthToken(user);
            return sendJson(res, {
                token: {
                    accessToken: tokenString,
                    refreshToken: tokenString,
                    expiresIn: 3456000,
                    tokenType: 'Bearer'
                },
                user
            });
        }

        // 4. POST /auth/logout
        if (path === '/auth/logout' && method === 'POST') {
            const auth = await getAuthUser(req);
            if (!auth) {
                return sendJson(res, { error: 'Unauthorized. Valid token required.' }, 401);
            }
            await revokeAuthToken(auth.token);
            return sendJson(res, { success: true, message: 'Logged out successfully' });
        }

        // 5. GET /posts
        if (path === '/posts' && method === 'GET') {
            const limit = parseInt(url.searchParams.get('limit')) || 50;
            const offset = parseInt(url.searchParams.get('offset')) || 0;

            const posts = await prisma.post.findMany({
                take: limit,
                skip: offset,
                orderBy: { createdAt: 'desc' },
                include: {
                    author: {
                        select: { id: true, username: true, displayName: true, profileImage: true, verified: true }
                    },
                    media: true,
                    _count: {
                        select: { likes: true, replies: true, reposts: true }
                    }
                }
            });

            const totalCount = await prisma.post.count();
            return sendJson(res, { posts, totalCount, limit, offset });
        }

        // 6. POST /posts
        if (path === '/posts' && method === 'POST') {
            const auth = await getAuthUser(req);
            if (!auth) {
                return sendJson(res, { error: 'Unauthorized. Valid token required.' }, 401);
            }

            const body = await parseJsonBody(req);
            const { content, media, replyToId } = body;
            if (!content) {
                return sendJson(res, { error: 'Content is required' }, 400);
            }

            const post = await prisma.post.create({
                data: {
                    content,
                    authorId: auth.user.id,
                    postType: media && media.length > 0 ? 'IMAGE' : 'TEXT',
                    replyToId: replyToId || null
                },
                include: {
                    author: {
                        select: { id: true, username: true, displayName: true, profileImage: true, verified: true }
                    }
                }
            });

            if (media && Array.isArray(media) && media.length > 0) {
                for (const m of media) {
                    await prisma.media.create({
                        data: {
                            url: m.url,
                            mediaType: m.type || 'IMAGE',
                            postId: post.id
                        }
                    });
                }
            }

            const updatedPost = await prisma.post.findUnique({
                where: { id: post.id },
                include: {
                    author: {
                        select: { id: true, username: true, displayName: true, profileImage: true, verified: true }
                    },
                    media: true,
                    _count: {
                        select: { likes: true, replies: true, reposts: true }
                    }
                }
            });

            return sendJson(res, updatedPost, 201);
        }

        // Match patterns for /posts/:id
        const postMatch = path.match(/^\/posts\/([a-zA-Z0-9-]+)$/);

        // 7. GET /posts/:id
        if (postMatch && method === 'GET') {
            const postId = postMatch[1];
            const post = await prisma.post.findUnique({
                where: { id: postId },
                include: {
                    author: {
                        select: { id: true, username: true, displayName: true, profileImage: true, verified: true }
                    },
                    media: true,
                    _count: {
                        select: { likes: true, replies: true, reposts: true }
                    }
                }
            });
            if (!post) {
                return sendJson(res, { error: 'Post not found' }, 404);
            }
            return sendJson(res, post);
        }

        // 8. PUT /posts/:id
        if (postMatch && method === 'PUT') {
            const auth = await getAuthUser(req);
            if (!auth) {
                return sendJson(res, { error: 'Unauthorized. Valid token required.' }, 401);
            }

            const postId = postMatch[1];
            const post = await prisma.post.findUnique({ where: { id: postId } });
            if (!post) {
                return sendJson(res, { error: 'Post not found' }, 404);
            }

            if (post.authorId !== auth.user.id) {
                return sendJson(res, { error: 'Forbidden. You do not own this post.' }, 403);
            }

            const body = await parseJsonBody(req);
            const { content } = body;
            if (!content) {
                return sendJson(res, { error: 'Content is required' }, 400);
            }

            const updatedPost = await prisma.post.update({
                where: { id: postId },
                data: { content },
                include: {
                    author: {
                        select: { id: true, username: true, displayName: true, profileImage: true, verified: true }
                    },
                    media: true,
                    _count: {
                        select: { likes: true, replies: true, reposts: true }
                    }
                }
            });

            return sendJson(res, updatedPost);
        }

        // 9. DELETE /posts/:id
        if (postMatch && method === 'DELETE') {
            const auth = await getAuthUser(req);
            if (!auth) {
                return sendJson(res, { error: 'Unauthorized. Valid token required.' }, 401);
            }

            const postId = postMatch[1];
            const post = await prisma.post.findUnique({ where: { id: postId } });
            if (!post) {
                return sendJson(res, { error: 'Post not found' }, 404);
            }

            if (post.authorId !== auth.user.id) {
                return sendJson(res, { error: 'Forbidden. You do not own this post.' }, 403);
            }

            // Cascade deletes for Sqlite compatibility
            await prisma.like.deleteMany({ where: { postId } });
            await prisma.media.deleteMany({ where: { postId } });
            await prisma.postHashtag.deleteMany({ where: { postId } });

            // Nullify replyToId and repostOfId associations
            await prisma.post.updateMany({
                where: { replyToId: postId },
                data: { replyToId: null }
            });
            await prisma.post.updateMany({
                where: { repostOfId: postId },
                data: { repostOfId: null }
            });

            await prisma.post.delete({ where: { id: postId } });
            return sendJson(res, { success: true, message: 'Post deleted successfully' });
        }

        // 10. GET /users/:username
        const userMatch = path.match(/^\/users\/([a-zA-Z0-9-_]+)$/);
        if (userMatch && method === 'GET') {
            const username = userMatch[1];
            const user = await prisma.user.findUnique({
                where: { username },
                include: {
                    _count: {
                        select: { posts: true, followers: true, following: true }
                    }
                }
            });
            if (!user) {
                return sendJson(res, { error: 'User not found' }, 404);
            }

            const posts = await prisma.post.findMany({
                where: { authorId: user.id },
                orderBy: { createdAt: 'desc' },
                include: {
                    author: {
                        select: { id: true, username: true, displayName: true, profileImage: true, verified: true }
                    },
                    media: true,
                    _count: {
                        select: { likes: true, replies: true, reposts: true }
                    }
                }
            });

            return sendJson(res, { user, posts });
        }

        // 11. PUT /users/profile
        if (path === '/users/profile' && method === 'PUT') {
            const auth = await getAuthUser(req);
            if (!auth) {
                return sendJson(res, { error: 'Unauthorized. Valid token required.' }, 401);
            }

            const body = await parseJsonBody(req);
            const { displayName, bio, profileImage, bannerImage, movies, books, music } = body;

            const updateData = {};
            if (displayName !== undefined) updateData.displayName = displayName;
            if (bio !== undefined) updateData.bio = bio;
            if (profileImage !== undefined) updateData.profileImage = profileImage;
            if (bannerImage !== undefined) updateData.bannerImage = bannerImage;
            if (movies !== undefined) updateData.movies = movies;
            if (books !== undefined) updateData.books = books;
            if (music !== undefined) updateData.music = music;

            const updatedUser = await prisma.user.update({
                where: { id: auth.user.id },
                data: updateData
            });

            return sendJson(res, updatedUser);
        }

        // If no match, fall through to other middleware
        next();
    } catch (err) {
        console.error('REST API Error:', err);
        return sendJson(res, { error: 'Internal Server Error' }, 500);
    }
}
