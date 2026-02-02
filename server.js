const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const csv = require('csv-parser');
const stream = require('stream');
const cors = require('cors');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

// --- CONFIGURATION: Email Profiles ---
// In a real app, these passwords come from process.env.MAIL_PASS_1, etc.
const EMAIL_PROFILES = {
    'profile_1': {
        name: 'Inquiries',
        email: 'codefest-inquiries@iicpc.com',
        user: process.env.EMAIL_USER_1 || 'codefest-inquiries@iicpc.com',
        pass: 'fafnyfoenwelsoee' // Set this in Render Env Vars later
    },
    'profile_2': {
        name: 'Support',
        email: 'support@iicpc.com',
        user: process.env.EMAIL_USER_2 || 'support@iicpc.com',
        pass: process.env.EMAIL_PASS_2 
    },
    'profile_3': {
        name: 'Events Team',
        email: 'events@iicpc.com',
        user: process.env.EMAIL_USER_3 || 'events@iicpc.com',
        pass: process.env.EMAIL_PASS_3 
    }
};

app.post('/api/send', upload.single('file'), async (req, res) => {
    // 1. Verify App Login (The Static Gatekeeper)
    const authHeader = req.headers['authorization'];
    if (authHeader !== 'Basic aWljcGM6Y29kZWZlc3Q=') { // Base64 for iicpc:codefest
        return res.status(401).json({ error: 'Unauthorized Access' });
    }

    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

    // 2. Select Profile
    const profileId = req.body.profileId;
    const profile = EMAIL_PROFILES[profileId];

    if (!profile) return res.status(400).json({ error: 'Invalid Email Profile' });

    console.log(`Using Profile: ${profile.name} (${profile.email})`);

    // 3. Create Transporter for selected profile
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com', // Explicitly define host
        port: 465,              // Explicitly use the SSL port (more reliable in cloud)
        secure: true,           // true for 465, false for other ports
        auth: {
            user: profile.user,
            pass: profile.pass,
        },
        // --- THE CRITICAL FIXES ---
        tls: {
            rejectUnauthorized: false // Helps avoid some strict SSL certificate issues
        },
        family: 4 // <--- THIS IS KEY: Forces Node to use IPv4 instead of IPv6
    });

    const results = [];
    const failures = [];
    let successCount = 0;

    const bufferStream = new stream.PassThrough();
    bufferStream.end(req.file.buffer);

    bufferStream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            console.log(`Processing ${results.length} emails...`);

            for (const student of results) {
                const name = student['NAME'];
                const email = student['EMAIL ID'];
                const ccHandle = student['Final CC Handle'];

                // HTML Template
                const htmlTemplate = `
                <div style="font-family:sans-serif; background:#f4f4f4; padding:20px;">
                    <div style="max-width:600px; margin:auto; background:#fff; padding:20px; border-radius:12px;">
                        <h2 style="color:#FF6B00; text-align:center;">CodeFest 2026 Prelims</h2>
                        <p>Hello <strong>${name}</strong>,</p>
                        <p>We are excited to have you! Here are your credentials for the prelims:</p>
                        
                        <div style="background:#FFF4EB; padding:15px; border-left:4px solid #FF6B00; margin:15px 0; border-radius:4px;">
                            <p style="margin:5px 0;"><strong>Login Email:</strong> ${email}</p>
                            <p style="margin:5px 0;"><strong>Username:</strong> ${ccHandle}</p>
                        </div>

                        <p style="text-align:center;">
                            <a href="https://www.codechef.com/CDFSPR01" style="background:#FF6B00; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold;">Start Practice</a>
                        </p>
                        <hr style="border:0; border-top:1px solid #ddd; margin:20px 0;">
                        <p style="font-size:12px; color:#666; text-align:center;">Sent by ${profile.name} | IICPC CodeFest Team</p>
                    </div>
                </div>
                `;

                const mailOptions = {
                    from: `"${profile.name} - CodeFest" <${profile.email}>`,
                    to: email,
                    subject: 'CodeFest 2026 Global – Prelims Credentials',
                    html: htmlTemplate,
                };

                try {
                    await transporter.sendMail(mailOptions);
                    successCount++;
                } catch (error) {
                    console.error(`Failed: ${email}`);
                    failures.push({ ...student, error: error.message });
                }
            }

            res.json({
                message: 'Process completed',
                total: results.length,
                success: successCount,
                failed: failures.length,
                failures: failures
            });
        });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
