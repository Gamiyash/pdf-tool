import express, { Application } from 'express';
import { configureApp } from './config/app.config';

const createApp = (): Application => {
    const app = express();

    // Configure all middleware and routes
    configureApp(app);

    return app;
};

export default createApp;
