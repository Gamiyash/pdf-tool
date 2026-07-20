# PDF Tools Backend API

A professional Node.js + Express.js + TypeScript backend for PDF manipulation and processing.

## 🚀 Features

- **Industry-Standard Architecture**: Controllers, Services, Repositories pattern
- **TypeScript**: Full type safety and modern JavaScript features
- **Express.js**: Fast, unopinionated web framework
- **Error Handling**: Centralized error handling middleware
- **Logging**: Structured logging with different levels
- **Validation**: Request validation using express-validator
- **Security**: Helmet, CORS, and other security best practices
- **Hot Reload**: Development server with automatic restart

## 📁 Project Structure

```
PDF_Project/
├── src/
│   ├── config/              # Configuration files
│   │   ├── app.config.ts    # Express app configuration
│   │   └── env.config.ts    # Environment variables
│   ├── controllers/         # Request handlers
│   │   ├── pdf.controller.ts
│   │   └── health.controller.ts
│   ├── services/            # Business logic layer
│   │   └── pdf.service.ts
│   ├── repositories/        # Data access layer
│   │   ├── base.repository.ts
│   │   └── pdf.repository.ts
│   ├── middleware/          # Express middleware
│   │   ├── error.middleware.ts
│   │   ├── notFound.middleware.ts
│   │   └── validation.middleware.ts
│   ├── routes/              # API routes
│   │   ├── index.ts
│   │   ├── pdf.routes.ts
│   │   └── health.routes.ts
│   ├── utils/               # Utility functions
│   │   ├── logger.util.ts
│   │   └── response.util.ts
│   ├── types/               # TypeScript types
│   │   ├── index.ts
│   │   └── express.d.ts
│   ├── app.ts               # Express app factory
│   └── server.ts            # Server entry point
├── dist/                    # Compiled JavaScript (generated)
├── uploads/                 # File uploads directory
├── .env                     # Environment variables
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── nodemon.json            # Nodemon configuration
└── README.md               # This file
```

## 🛠️ Setup Instructions

### Prerequisites

- Node.js >= 18.x
- npm or yarn

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Update variables as needed

3. **Start development server:**
   ```bash
   npm run dev
   ```

   The server will start on http://localhost:3000

## 📝 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Start production server (requires build first)
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## 🔌 API Endpoints

### Health Check
- `GET /health` - Basic health check
- `GET /api/health` - Detailed health status
- `GET /api/health/info` - API information

### PDF Operations
- `GET /api/pdf` - Get all PDFs
- `GET /api/pdf/:id` - Get PDF by ID
- `POST /api/pdf/upload` - Upload PDF
- `DELETE /api/pdf/:id` - Delete PDF
- `POST /api/pdf/merge` - Merge PDFs (coming soon)
- `POST /api/pdf/split` - Split PDF (coming soon)
- `POST /api/pdf/compress` - Compress PDF (coming soon)

## 🏗️ Architecture Patterns

### Three-Layer Architecture

1. **Controllers**: Handle HTTP requests and responses
2. **Services**: Contain business logic
3. **Repositories**: Handle data persistence

### Design Principles

- **Separation of Concerns**: Each layer has a specific responsibility
- **Dependency Injection**: Easy to test and maintain
- **Error Handling**: Centralized error handling
- **Type Safety**: Full TypeScript support
- **Scalability**: Ready for microservices architecture

## 🔐 Environment Variables

```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

## 🚦 Next Steps

1. **Database Integration**: Add MongoDB/PostgreSQL
2. **File Upload**: Implement Multer for file handling
3. **PDF Processing**: Integrate pdf-lib, Puppeteer, etc.
4. **Authentication**: Add JWT-based authentication
5. **Testing**: Add unit and integration tests
6. **Docker**: Containerize the application
7. **CI/CD**: Set up automated deployment

## 📚 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Language**: TypeScript 5.x
- **Security**: Helmet, CORS
- **Logging**: Morgan
- **Validation**: express-validator

## 🤝 Contributing

1. Follow the existing code structure
2. Use TypeScript strict mode
3. Write descriptive commit messages
4. Add comments for complex logic

## 📄 License

ISC

---

**Built with ❤️ using Node.js, Express.js, and TypeScript**
