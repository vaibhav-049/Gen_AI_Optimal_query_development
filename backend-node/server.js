const dotenv = require('dotenv');

dotenv.config();

const app = require('./src/app');


const PORT = process.env.PORT || 9000;

const server = app.listen(PORT, () => {
    console.log(`Node.js Backend is running on port ${PORT}...`);
});


process.on('unhandledRejection', (err) => {
    console.log('UNHANDLED REJECTION! 💥 Shutting down...');
    console.log(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});
