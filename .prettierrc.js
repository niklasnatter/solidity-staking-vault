module.exports = {
    singleQuote: true,
    overrides: [
        {
            files: '**/*.sol',
            options: {
                singleQuote: false,
            },
        },
    ],
};
