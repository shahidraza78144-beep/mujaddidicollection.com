const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ==========================================
// 1. GMAIL SENDER CONFIGURATION
// ==========================================
const mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'shahidrazaattari428@gmail.com',
        pass: 'fxen jgjf tffw qtxb'
    }
});

// ==========================================
// 2. CROSS-DEVICE LOGIN, REGISTER & ORDER SYNC
// ==========================================
const DB_FILE = path.join(__dirname, 'database.json');

function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], orders: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Fetch all shared users and orders so any device sees them
app.get('/api/sync', (req, res) => {
    res.json(readDB());
});

// Save newly registered users from any device
app.post('/api/sync/users', (req, res) => {
    const db = readDB();
    const incomingUsers = req.body.users || [];
    incomingUsers.forEach(u => {
        if (u && u.username && !db.users.some(existing => existing.username.toLowerCase() === u.username.toLowerCase())) {
            db.users.push(u);
        }
    });
    writeDB(db);
    res.json({ success: true, users: db.users });
});

// Save orders placed from any device
app.post('/api/sync/orders', (req, res) => {
    const db = readDB();
    const incomingOrders = req.body.orders || [];
    incomingOrders.forEach(o => {
        if (o && o.orderId && !db.orders.some(existing => String(existing.orderId) === String(o.orderId))) {
            db.orders.unshift(o);
        }
    });
    writeDB(db);
    res.json({ success: true, orders: db.orders });
});

// ==========================================
// 3. BRANDED PDF RECEIPT GENERATOR
// ==========================================
function generateReceiptPDF(order) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const boxX = 40;
        const boxW = pageWidth - 80; // 515px on A4
        const innerX = boxX + 25;
        const innerW = boxW - 50; // 465px

        // Outer white invoice card border & 8px Navy top bar (#051532)
        doc.rect(boxX, 40, boxW, 740).fillAndStroke('#ffffff', '#eeeeee');
        doc.rect(boxX, 40, boxW, 8).fill('#051532');

        // 1. HEADER ROW
        // Left: Two-tone Brand Title ("Mujaddidi" Navy + "Collection" Gold)
        doc.font('Helvetica-Bold').fontSize(22).fillColor('#051532')
            .text('Mujaddidi ', innerX, 68, { continued: true })
            .fillColor('#eba345')
            .text('Collection');

        doc.font('Helvetica').fontSize(10).fillColor('#777777')
            .text('Premium Traditional Apparel & Essentials', innerX, 95);

        // Right: INVOICE RECEIPT & Meta Info
        const accountUser = order.accountUser || order.customerName || 'Guest';
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#051532')
            .text('INVOICE RECEIPT', innerX, 68, { width: innerW, align: 'right' });

        doc.font('Helvetica').fontSize(10).fillColor('#555555')
            .text(`Invoice ID: #MJD-${order.orderId}`, innerX, 86, { width: innerW, align: 'right' })
            .text(`Order Date: ${order.date || 'N/A'}`, innerX, 100, { width: innerW, align: 'right' })
            .text(`Account User: ${accountUser}`, innerX, 114, { width: innerW, align: 'right' });

        // 2. DELIVERY DESTINATION SECTION
        let y = 152;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#051532')
            .text('DELIVERY DESTINATION', innerX, y);
        y += 15;
        doc.moveTo(innerX, y).lineTo(innerX + innerW, y).lineWidth(2).strokeColor('#eba345').stroke();

        y += 10;
        const formattedAddress = String(order.address || 'N/A')
            .replace(/, Ph:/g, '\nPhone:')
            .replace(/ - /g, '\nPIN Code: ');

        const addrHeight = Math.max(58, doc.heightOfString(formattedAddress, { width: innerW - 24, lineGap: 3 }) + 20);

        // Cream address box (#fdfaf4) with 3px Navy left border (#051532)
        doc.rect(innerX, y, innerW, addrHeight).fill('#fdfaf4');
        doc.rect(innerX, y, 3, addrHeight).fill('#051532');

        doc.font('Helvetica').fontSize(10).fillColor('#444444')
            .text(formattedAddress, innerX + 14, y + 10, { width: innerW - 24, lineGap: 3 });

        // 3. ORDER ITEMS SUMMARY SECTION
        y += addrHeight + 25;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#051532')
            .text('ORDER ITEMS SUMMARY', innerX, y);
        y += 15;
        doc.moveTo(innerX, y).lineTo(innerX + innerW, y).lineWidth(2).strokeColor('#eba345').stroke();

        // Table Header (#051532 Navy Bar)
        y += 10;
        doc.rect(innerX, y, innerW, 28).fill('#051532');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
            .text('ITEM DESCRIPTION', innerX + 10, y + 9)
            .text('QTY', innerX + 300, y + 9, { width: 50, align: 'center' })
            .text('PRICE', innerX + 360, y + 9, { width: 95, align: 'right' });

        y += 28;
        doc.font('Helvetica').fontSize(10).fillColor('#333333');

        // Table Rows
        const itemsList = (order.items && order.items.length > 0)
            ? order.items
            : [{ name: order.itemsDescription || 'Standard Collection Purchase', quantity: 1, price: order.totalPaid }];

        itemsList.forEach((item) => {
            const itemName = item.name || item.title || 'Product Item';
            const qty = item.quantity || item.qty || 1;
            const price = parseFloat(item.price || 0).toFixed(2);

            doc.text(itemName, innerX + 10, y + 9, { width: 285 })
                .text(String(qty), innerX + 300, y + 9, { width: 50, align: 'center' })
                .text('Rs. ' + price, innerX + 360, y + 9, { width: 95, align: 'right' });

            y += 28;
            doc.moveTo(innerX, y).lineTo(innerX + innerW, y).lineWidth(1).strokeColor('#eeeeee').stroke();
        });

        // Grand Total Summary Row (#fdfaf4 background + 2px #051532 top border + #eba345 Gold price)
        doc.rect(innerX, y, innerW, 34).fill('#fdfaf4');
        doc.moveTo(innerX, y).lineTo(innerX + innerW, y).lineWidth(2).strokeColor('#051532').stroke();

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#051532')
            .text('Grand Total Summary:', innerX + 10, y + 11, { width: 340, align: 'right' })
            .fillColor('#eba345')
            .text('Rs. ' + parseFloat(order.totalPaid || 0).toFixed(2), innerX + 360, y + 11, { width: 95, align: 'right' });

        // 4. FOOTER NOTE (Dashed top divider)
        const footerY = 710;
        doc.save()
            .moveTo(innerX, footerY)
            .lineTo(innerX + innerW, footerY)
            .lineWidth(1)
            .dash(4, { space: 3 })
            .strokeColor('#dddddd')
            .stroke()
            .restore();

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#555555')
            .text('Thank you for shopping with Mujaddidi Collection!', innerX, footerY + 14, { width: innerW, align: 'center' });

        doc.font('Helvetica').fontSize(9).fillColor('#777777')
            .text('This is an automatically generated system electronic invoice receipt documentation record.', innerX, footerY + 29, { width: innerW, align: 'center' });

        doc.end();
    });
}

// ==========================================
// 4. AUTOMATIC GMAIL PDF RECEIPT SENDER
// ==========================================
app.post('/api/send-email-receipt', async (req, res) => {
    try {
        const order = req.body;
        if (!order || !order.customerEmail) {
            return res.status(400).json({ error: 'Customer email address not found for this order.' });
        }

        const pdfBuffer = await generateReceiptPDF(order);
        const fileName = 'Receipt_MJD-' + order.orderId + '.pdf';

        await mailTransporter.sendMail({
            from: '"Mujaddidi Collection" <shahidrazaattari428@gmail.com>',
            to: order.customerEmail,
            subject: `Official Order Receipt #MJD-${order.orderId} - Mujaddidi Collection`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #222; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #051532; padding: 20px; text-align: center;">
                        <h2 style="color: #eba345; margin: 0;">MUJADDIDI COLLECTION</h2>
                        <p style="color: #ffffff; font-size: 13px; margin: 5px 0 0;">Official Tax & Delivery Receipt</p>
                    </div>
                    <div style="padding: 25px;">
                        <p>Assalamu Alaikum <strong>${order.customerName}</strong>,</p>
                        <p>Thank you for shopping with <strong>Mujaddidi Collection</strong>! Your order <strong>#MJD-${order.orderId}</strong> has been delivered.</p>
                        <p style="background: #f9f9fb; padding: 12px; border-left: 4px solid #eba345;">
                            <strong>Total Amount Paid:</strong> Rs. ${order.totalPaid}<br>
                            <strong>Order Date:</strong> ${order.date || 'N/A'}
                        </p>
                        <p>Please find your official PDF receipt attached to this email.</p>
                        <p style="margin-top: 25px; font-size: 12px; color: #777;">Warm regards,<br><strong>Team Mujaddidi Collection</strong></p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: fileName,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Gmail Send Error:', err.message);
        res.status(500).json({ error: err.message || 'Failed to send email receipt.' });
    }
});

// Optional: Direct PDF download route
app.post('/api/download-receipt', async (req, res) => {
    try {
        const order = req.body;
        const pdfBuffer = await generateReceiptPDF(order);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Receipt_MJD-${order.orderId}.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        res.status(500).json({ error: 'Could not generate PDF.' });
    }
});

app.listen(3000, '0.0.0.0', () => {
    console.log('✅ Mujaddidi Collection Server running on http://127.0.0.1:3000');
});
