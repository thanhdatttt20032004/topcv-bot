const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';

async function startBot() {
    let browser;
    try {
        console.log("1. Xác thực Google Sheets...");
        let creds = process.env.GOOGLE_JSON ? JSON.parse(process.env.GOOGLE_JSON) : JSON.parse(fs.readFileSync('./goog.json', 'utf8'));
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: creds.client_email,
            private_key: creds.private_key.replace(/\\n/g, '\n'),
        });
        await doc.loadInfo();
        console.log("--- KẾT NỐI SHEET THÀNH CÔNG: " + doc.title);
        const sheet = doc.sheetsByIndex[0];

        console.log("2. Khởi động trình duyệt...");
        browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();

        // Tối ưu: Chặn tải ảnh và CSS để load cực nhanh
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log("3. Truy cập TopCV...");
        await page.goto('https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026', { 
            waitUntil: 'domcontentloaded', // Chỉ đợi HTML xong là quét luôn
            timeout: 30000 
        });

console.log("4. Đang bóc tách dữ liệu...");
        const jobs = await page.evaluate(() => {
            const results = [];
            // Chiến thuật "vét cạn": Tìm tất cả các link có chứa từ khóa tuyển dụng
            const jobCards = document.querySelectorAll('a[href*="/viec-lam/"], .job-item-2, .box-job');
            
            jobCards.forEach(card => {
                // Lấy tiêu đề từ thẻ a hoặc các thẻ tiêu đề bên trong
                const title = card.innerText.split('\n')[0].trim();
                
                // Cố gắng tìm tên công ty ở các thẻ lân cận
                const container = card.closest('div') || card.parentElement;
                const company = container.innerText.split('\n')[1] || 'Farmers Market Check';

                if (title.length > 10 && !results.some(r => r['Tiêu đề'] === title)) {
                    results.push({
                        'Tiêu đề': title,
                        'Công ty': company,
                        'Địa điểm': 'Hồ Chí Minh/Toàn quốc',
                        'Ngày quét': new Date().toLocaleString('vi-VN')
                    });
                }
            });
            return results;
        });

        if (jobs.length > 0) {
            console.log(`5. THÀNH CÔNG! Tìm thấy ${jobs.length} tin. Đang lưu...`);
            await sheet.addRows(jobs);
            console.log("--- DỮ LIỆU ĐÃ VỀ SHEET ---");
        } else {
            console.log("Cảnh báo: Không tìm thấy tin. Đang chụp ảnh debug...");
            await page.screenshot({ path: 'debug.png', fullPage: true });
        }

    } catch (error) {
        console.error("Lỗi rồi Đạt ơi:", error.message);
    } finally {
        if (browser) await browser.close();
    }
}

startBot();
