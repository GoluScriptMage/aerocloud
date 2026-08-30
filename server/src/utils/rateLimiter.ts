import rateLimit from "express-rate-limit";

// Rate limiter middleware for /deploy route
export const deployRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 5, // Limit each IP to 5 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    validate: { xForwardedForHeader: false },
    message: {
        error: "Too Many Requests",
        message: "Deployment rate limit exceeded (5 requests per 15 minutes). Please try again later."
    }
});

export const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    validate: { xForwardedForHeader: false },
    message: {
        error: "Too Many Requests",
        message: "Global rate limit exceeded (100 requests per 15 minutes). Please try again later."
    }
});