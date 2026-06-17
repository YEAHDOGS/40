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

});
