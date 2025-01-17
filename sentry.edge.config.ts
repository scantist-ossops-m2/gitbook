import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
    Sentry.init({
        debug: false,
        dsn,

        // Disable tracing as it creates additional requests in an env where subrequests are limited.
        enableTracing: false,

        // Disable transactions  as it creates additional requests in an env where subrequests are limited.
        // https://docs.sentry.io/platforms/node/configuration/filtering/#using--3
        beforeSendTransaction: () => {
            return null;
        },
    });
}
