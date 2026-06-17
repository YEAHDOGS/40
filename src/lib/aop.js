/**
 * Aspect-Oriented Programming (AOP) weaver.
 * Replaces a method on a target object with an advice function.
 * 
 * @param {object} target - The object containing the method (e.g. window).
 * @param {string} methodName - The name of the method to weave (e.g. 'fetch').
 * @param {function} advice - The advice function which receives the original method and arguments.
 */
export function weave(target, methodName, advice) {
    const original = target[methodName];
    if (typeof original !== 'function') return;
    target[methodName] = function (...args) {
        return advice.call(this, original.bind(this), ...args);
    };
}

// Global handle for unauthorized states
function handleUnauthorized() {
    console.warn("AOP Interceptor: Unauthorized detected. Cleaning session and redirecting to login.");
    localStorage.removeItem("40forty_token");
    localStorage.removeItem("40forty_session");
    window.location.reload();
}

// Weave Aspect around window.fetch
if (typeof window !== 'undefined' && window.fetch) {
    weave(window, 'fetch', async (proceed, input, init) => {
        try {
            const response = await proceed(input, init);
            
            // 1. Check for standard HTTP 401 Unauthorized status
            if (response.status === 401) {
                handleUnauthorized();
                return response;
            }

            // 2. Check for GraphQL errors containing "Unauthorized" in the JSON response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                // Clone response to avoid consuming the stream
                const clone = response.clone();
                try {
                    const data = await clone.json();
                    if (data.errors && data.errors.some(e => {
                        const message = e.message || "";
                        const originalMessage = e.extensions?.originalError?.message || "";
                        const code = e.extensions?.code || "";
                        return message.includes("Unauthorized") || 
                               originalMessage.includes("Unauthorized") ||
                               code === "UNAUTHORIZED";
                    })) {
                        handleUnauthorized();
                    }
                } catch (_) {
                    // Ignore JSON parsing errors for non-JSON responses or invalid bodies
                }
            }

            return response;
        } catch (error) {
            // Re-throw network-level errors
            throw error;
        }
    });
}
