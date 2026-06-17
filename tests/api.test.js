import test from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import { restApiHandler } from '../src/server/rest.js';

// Helper to create mock request stream
function createMockReq(method, url, headers = {}, body = null) {
    const req = new Readable({
        read() {}
    });
    req.method = method;
    req.url = url;
    req.headers = headers;
    if (body) {
        req.push(JSON.stringify(body));
    }
    req.push(null);
    return req;
}

// Helper to create mock response stream
function createMockRes() {
    let resolveFn;
    const promise = new Promise((resolve) => {
        resolveFn = resolve;
    });

    const res = {
        statusCode: 200,
        headers: {},
        body: '',
        writeHead(status, headers) {
            this.statusCode = status;
            Object.assign(this.headers, headers);
            return this;
        },
        end(chunk) {
            if (chunk) {
                this.body += chunk;
            }
            resolveFn(this);
        },
        wait() {
            return promise;
        }
    };
    return res;
}

test('REST API Handler Unit Tests', async (t) => {
    
    await t.test('GET /api/AllIsGood - Health Check routing', async () => {
        const req = createMockReq('GET', '/api/AllIsGood');
        const res = createMockRes();
        let nextCalled = false;
        
        await restApiHandler(req, res, () => {
            nextCalled = true;
        });

        const completedRes = await res.wait();
        
        assert.strictEqual(completedRes.statusCode, 200);
        assert.strictEqual(completedRes.headers['Content-Type'], 'application/json');
        
        const data = JSON.parse(completedRes.body);
        assert.strictEqual(data.status, 'ok');
        assert.strictEqual(data.message, 'All is good');
        assert.strictEqual(nextCalled, false, 'Should not pass through to next middleware');
    });

    await t.test('POST /api/auth/signup - Validation of required fields', async () => {
        const req = createMockReq('POST', '/api/auth/signup', {}, {
            username: 'missing_email_and_display_name'
        });
        const res = createMockRes();
        
        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 400);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('Username, email, and displayName are required'));
    });

    await t.test('POST /api/auth/login - Validation of username', async () => {
        const req = createMockReq('POST', '/api/auth/login', {}, {});
        const res = createMockRes();
        
        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 400);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('Username is required'));
    });

    await t.test('POST /api/posts - Authorization Guard blocks anonymous creation', async () => {
        const req = createMockReq('POST', '/api/posts', {}, {
            content: 'Should fail'
        });
        const res = createMockRes();
        
        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 401);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('Unauthorized'));
    });

    await t.test('PUT /api/users/profile - Authorization Guard blocks anonymous update', async () => {
        const req = createMockReq('PUT', '/api/users/profile', {}, {
            bio: 'New bio'
        });
        const res = createMockRes();
        
        await restApiHandler(req, res, () => {});
        const completedRes = await res.wait();

        assert.strictEqual(completedRes.statusCode, 401);
        const data = JSON.parse(completedRes.body);
        assert.ok(data.error.includes('Unauthorized'));
    });

    await t.test('GET /api/unknown-route - Passes through to next middleware', async () => {
        const req = createMockReq('GET', '/api/unknown-route');
        const res = createMockRes();
        let nextCalled = false;
        
        await restApiHandler(req, res, () => {
            nextCalled = true;
        });

        // The handler is expected to call next() and not end the response
        assert.strictEqual(nextCalled, true, 'Should invoke next() middleware');
    });

    await t.test('POST /api/posts & GET /api/posts/:id - Comment creation and detail retrieval', async () => {
        // 1. Signup a user
        const signupReq = createMockReq('POST', '/api/auth/signup', {}, {
            username: `unit_tester_${Math.random().toString(36).substring(7)}`,
            email: `unit_tester_${Math.random().toString(36).substring(7)}@example.com`,
            displayName: 'Unit Tester'
        });
        const signupRes = createMockRes();
        await restApiHandler(signupReq, signupRes, () => {});
        const signupResult = await signupRes.wait();
        
        assert.strictEqual(signupResult.statusCode, 201);
        const signupData = JSON.parse(signupResult.body);
        const token = signupData.token.accessToken;

        // 2. Create a parent post
        const createPostReq = createMockReq('POST', '/api/posts', {
            'authorization': `Bearer ${token}`
        }, {
            content: 'Parent Post Content'
        });
        const createPostRes = createMockRes();
        await restApiHandler(createPostReq, createPostRes, () => {});
        const createPostResult = await createPostRes.wait();
        
        assert.strictEqual(createPostResult.statusCode, 201);
        const parentPost = JSON.parse(createPostResult.body);
        const parentPostId = parentPost.id;

        // 3. Create a comment (replyToId set to parentPostId)
        const createCommentReq = createMockReq('POST', '/api/posts', {
            'authorization': `Bearer ${token}`
        }, {
            content: 'This is a comment to parent post',
            replyToId: parentPostId
        });
        const createCommentRes = createMockRes();
        await restApiHandler(createCommentReq, createCommentRes, () => {});
        const createCommentResult = await createCommentRes.wait();
        
        assert.strictEqual(createCommentResult.statusCode, 201);
        const commentPost = JSON.parse(createCommentResult.body);
        assert.strictEqual(commentPost.replyToId, parentPostId);

        // 4. Retrieve single post details
        const getPostReq = createMockReq('GET', `/api/posts/${parentPostId}`);
        const getPostRes = createMockRes();
        await restApiHandler(getPostReq, getPostRes, () => {});
        const getPostResult = await getPostRes.wait();
        
        assert.strictEqual(getPostResult.statusCode, 200);
        const retrievedPost = JSON.parse(getPostResult.body);
        assert.strictEqual(retrievedPost.id, parentPostId);
        assert.strictEqual(retrievedPost.content, 'Parent Post Content');
    });

});
