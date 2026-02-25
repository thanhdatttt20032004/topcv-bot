const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Lấy ID Sheet từ biến môi trường
const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';

async function startBot() {
    try {
        console.log("1. Đang chuẩn bị xác thực Google Sheets...");
        let creds;
        
        // Ưu tiên lấy từ GitHub Secrets, nếu không có thì lấy file local
        if (process.env.GOOGLE_JSON) {
            creds = JSON.parse(process.env.GOOGLE_JSON);
        } else {
            creds = JSON.parse(fs.readFileSync('./goog.json', 'utf8'));
        }

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

        // Xử lý Private Key để tránh lỗi Invalid JWT Signature
        const privateKey = creds.private_key.replace(/\\n/g, '\n');

        await doc.useServiceAccountAuth({
            client_email: creds.client_email,
            private_key: privateKey,
        });

        await doc.loadInfo();
        console.log("--- XÁC THỰC THÀNH CÔNG! Đã kết nối tới Sheet: " + doc.title);
        const sheet = doc.sheetsByIndex[0];

        console.log("2. Đang khởi động trình duyệt tàng hình (Puppeteer)...");
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ] 
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Giả lập User Agent mới nhất
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log("3. Đang truy cập TopCV và chờ tải trang...");
        await page.goto('https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026', { 
            waitUntil: 'networkidle0', // Chờ cho đến khi không còn lưu lượng mạng
            timeout: 90000 
        });

        // Chờ thêm 5 giây để đảm bảo các thành phần JavaScript đã render xong
        console.log("- Đợi trang ổn định trong 5 giây...");
        await new Promise(r => setTimeout(r, 5000));

        console.log("- Đang cuộn trang kỹ để kích hoạt nạp tin...");
        await page.evaluate(async () => {
            for (let i = 0; i < 10; i++) {
                window.scrollBy(0, 600);
                await new Promise(r => setTimeout(r, 600));
            }
        });

        console.log("4. Đang bóc tách dữ liệu tin tuyển dụng...");
        const jobs = await page.evaluate(() => {
            // Bộ chọn Selector "Vét cạn" cho nhiều giao diện của TopCV
            const items = document.querySelectorAll('.job-item-2, .job-item-search-result, .job-item, [class*="job-item"], .box-job');
            
            return Array.from(items).map(item => {
                const titleEl = item.querySelector('h3 a, .title, .job-title, .title-job, a[target="_blank"]');
                const companyEl = item.querySelector('.company, .company-name, .name-company, a[href*="/cong-ty/"]');
                const addressEl = item.querySelector('.address, .location, .city, .label-content, .info-address');

                return {
                    'Tiêu đề': titleEl ? titleEl.innerText.trim() : '',
                    'Công ty': companyEl ? companyEl.innerText.trim() : '',
                    'Địa điểm': addressEl ? addressEl.innerText.trim() : '',
                    'Ngày quét': new Date().toLocaleString('vi-VN')
                };
            }).filter(j => j['Tiêu đề'] && j['Tiêu đề'].length > 3);
        });

        if (jobs.length > 0) {
            console.log(`5. Thành công! Tìm thấy ${jobs.length} tin. Đang lưu vào Google Sheet...`);
            await sheet.addRows(jobs);
            console.log("--- HOÀN THÀNH! DỮ LIỆU ĐÃ ĐƯỢC GHI VÀO SHEET ---");
        } else {
            console.log("Cảnh báo: Không tìm thấy tin nào. Có thể do giao diện web thay đổi.");
        }

        await browser.close();

    } catch (error) {
        console.error("Lỗi hệ thống Đạt ơi:", error.message);
        process.exit(1);
    }
}

startBot();
