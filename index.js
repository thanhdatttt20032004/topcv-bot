const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Lấy thông tin từ môi trường GitHub hoặc file local
const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';

async function startBot() {
    try {
        console.log("1. Đang khởi tạo quyền truy cập (Bản v3.3.0)...");
        let creds;
        if (process.env.GOOGLE_JSON) {
            creds = JSON.parse(process.env.GOOGLE_JSON);
        } else {
            creds = JSON.parse(fs.readFileSync('./goog.json', 'utf8'));
        }

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

        // --- CÁCH XÁC THỰC DÀNH RIÊNG CHO BẢN V3 ---
        await doc.useServiceAccountAuth({
            client_email: creds.client_email,
            private_key: creds.private_key,
        });

        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        console.log("2. Đang mở trình duyệt tàng hình...");
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        // Giả lập người dùng thật
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log("3. Đang truy cập TopCV và quét dữ liệu...");
        await page.goto('https://www.topcv.vn/viec-lam-it-phan-mem-c10026', { waitUntil: 'networkidle2', timeout: 60000 });

        // Cuộn trang nhẹ để kích hoạt load tin
        await page.evaluate(() => window.scrollBy(0, 1000));
        await new Promise(r => setTimeout(r, 2000));

        const jobs = await page.evaluate(() => {
            const items = document.querySelectorAll('.job-item-2, .job-item-search-result, [class*="job-item"]');
            return Array.from(items).map(item => ({
                'Tiêu đề': item.querySelector('.title, .job-title, h3')?.innerText.trim(),
                'Công ty': item.querySelector('.company, .company-name')?.innerText.trim(),
                'Địa điểm': item.querySelector('.address, .location')?.innerText.trim(),
                'Ngày quét': new Date().toLocaleString('vi-VN')
            })).filter(j => j['Tiêu đề'] && j['Tiêu đề'].length > 3);
        });

        if (jobs.length > 0) {
            console.log(`4. Thành công rực rỡ! Tìm thấy ${jobs.length} tin. Đang lưu...`);
            await sheet.addRows(jobs);
            console.log("--- BOT ĐÃ HOÀN THÀNH NHIỆM VỤ! ---");
        } else {
            console.log("Cảnh báo: Không nhặt được tin nào. Hãy kiểm tra lại giao diện TopCV.");
        }

        await browser.close();

    } catch (error) {
        console.error("Lỗi rồi Đạt ơi:", error.message);
    }
}

startBot();