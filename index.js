const puppeteer = require('puppeteer-extra');

const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const { GoogleSpreadsheet } = require('google-spreadsheet');

const fs = require('fs');



puppeteer.use(StealthPlugin());



const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';



async function startBot() {

    try {

        console.log("1. Đang chuẩn bị xác thực Google Sheets...");

        let creds;

        if (process.env.GOOGLE_JSON) {

            creds = JSON.parse(process.env.GOOGLE_JSON);

        } else {

            creds = JSON.parse(fs.readFileSync('./goog.json', 'utf8'));

        }



        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

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

                '--disable-blink-features=AutomationControlled'

            ] 

        });

        const page = await browser.newPage();

        

        // Đặt kích thước màn hình phổ biến để tránh bị phát hiện là bot

        await page.setViewport({ width: 1366, height: 768 });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');



        console.log("3. Đang truy cập TopCV...");

        // Dùng URL tìm kiếm có tham số rõ ràng để trang load ổn định hơn

        await page.goto('https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026?sort=new', { 

            waitUntil: 'networkidle2', 

            timeout: 60000 

        });



        console.log("- Đợi 5 giây cho các thành phần JavaScript chạy...");

        await new Promise(r => setTimeout(r, 5000));



        console.log("- Đang cuộn trang sâu để kích hoạt dữ liệu...");

        await page.evaluate(async () => {

            for (let i = 0; i < 5; i++) {

                window.scrollBy(0, 800);

                await new Promise(r => setTimeout(r, 800));

            }

        });



        console.log("4. Đang bóc tách dữ liệu tin tuyển dụng...");

        const jobs = await page.evaluate(() => {

            // Bộ Selector mới nhắm vào các thẻ bao quát nhất

            const items = document.querySelectorAll('.job-item-2, .job-body, .box-job, [class*="job-item"]');

            

            return Array.from(items).map(item => {

                // Tìm tiêu đề trong bất kỳ thẻ a hoặc h3 nào có chứa chữ

                const titleEl = item.querySelector('h3 a, .title, a[target="_blank"]');

                const companyEl = item.querySelector('.company, .company-name, a[href*="/cong-ty/"]');

                const addressEl = item.querySelector('.address, .location, .info-address, .label-content');



                return {

                    'Tiêu đề': titleEl ? titleEl.innerText.trim() : '',

                    'Công ty': companyEl ? companyEl.innerText.trim() : '',

                    'Địa điểm': addressEl ? addressEl.innerText.trim() : '',

                    'Ngày quét': new Date().toLocaleString('vi-VN')

                };

            }).filter(j => j['Tiêu đề'] && j['Tiêu đề'].length > 5);

        });



        // Loại bỏ tin trùng lặp trong cùng một lần quét

        const uniqueJobs = Array.from(new Set(jobs.map(JSON.stringify))).map(JSON.parse);



        if (uniqueJobs.length > 0) {

            console.log(`5. Thành công! Tìm thấy ${uniqueJobs.length} tin mới. Đang lưu vào Sheet...`);

            await sheet.addRows(uniqueJobs);

            console.log("--- HOÀN THÀNH ---");

        } else {

            console.log("Cảnh báo: Không tìm thấy tin nào. Đang chụp ảnh màn hình để kiểm tra...");

            await page.screenshot({ path: 'debug.png' });

            console.log("Đã lưu ảnh debug.png, Đạt kiểm tra xem trang web hiện gì nhé.");

        }



        await browser.close();



    } catch (error) {

        console.error("Lỗi hệ thống Đạt ơi:", error.message);

        process.exit(1);

    }

}
startBot();


startBot();
