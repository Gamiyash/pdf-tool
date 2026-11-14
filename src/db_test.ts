import mongoose from 'mongoose';
import Conversation from './models/conversation.model';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pdf_tool');
    const conv: any = await Conversation.findOne().sort({ updatedAt: -1 });
    if (!conv) {
        console.log("No conversations found");
        process.exit(1);
    }

    console.log("Conversation ID:", conv._id);
    console.log("Total Versions:", conv.document?.versions?.length);
    console.log("Current Version:", conv.document?.currentVersion);

    const latest = conv.document?.versions?.find((v: any) => v.version === conv.document?.currentVersion);

    console.log("Latest version section count:", latest?.structure?.sections?.length);
    if (latest && conv.documentStructure?.sections) {
        console.log(`Document found. Total sections: ${conv.documentStructure.sections.length}`);

        // Truncate sections if duplicated
        if (conv.documentStructure.sections.length > 50) {
            conv.documentStructure.sections = conv.documentStructure.sections.slice(0, 144);
            conv.markModified('documentStructure');
            await conv.save();
            console.log(`Truncated duplicated sections. New section count: ${conv.documentStructure.sections.length}`);
        }
        conv.markModified('document.versions');
        await conv.save();
        console.log("Database successfully cleaned and saved!");
    }

    process.exit(0);
}
run().catch(console.error);
