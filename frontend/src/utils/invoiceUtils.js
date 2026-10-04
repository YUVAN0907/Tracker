// Invoice PDF Generation Utility
// Generates professional invoice PDF with company branding

import logoImage from '../assets/fasobees_logo.jpeg';

// Calculate cases: round up any partial case
const calculateCases = (units, unitsPerCase) => {
    if (units <= 0) return 0;
    return Math.ceil(units / unitsPerCase);
};

export const generateInvoicePDF = async (billItems, billDate) => {
    // Dynamically import html2pdf
    const html2pdf = (await import('html2pdf.js')).default;

    const invoiceDate = new Date(billDate);
    const invoiceNumber = `INV-${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${String(invoiceDate.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
    
    const totalAmount = billItems.reduce((sum, item) => sum + item.Total_Amount, 0);
    const totalUnits = billItems.reduce((sum, item) => sum + item.Quantity, 0);
    const totalCases = billItems.reduce((sum, item) => sum + (item.Cases || calculateCases(item.Quantity, item.Units_Per_Case)), 0);
    const gstAmount = billItems.reduce((sum, item) => sum + (item.Total_Amount * item.GST), 0);
    const grandTotal = totalAmount + gstAmount;

    const formattedDate = invoiceDate.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Generate HTML content for the invoice
    const invoiceHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Invoice - ${invoiceNumber}</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: Arial, sans-serif;
                    color: #000;
                    background: white;
                    font-size: 10px;
                    line-height: 1.4;
                }
                
                .container {
                    padding: 10px;
                }
                
                /* Header Table Structure */
                .header-table {
                    width: 100%;
                    border-collapse: collapse;
                    border: 2px solid #000;
                    margin-bottom: 15px;
                    font-size: 10px;
                    table-layout: fixed;
                }
                
                .header-table td {
                    border-right: 2px solid #000;
                    padding: 12px 10px;
                    vertical-align: top;
                    width: 33.33%;
                    line-height: 1.5;
                }
                
                .header-table td:last-child {
                    border-right: none;
                }
                
                .header-table h2 {
                    font-size: 14px;
                    font-weight: bold;
                    margin: 0 0 8px 0;
                }
                
                .header-table h3 {
                    font-size: 12px;
                    font-weight: bold;
                    margin: 5px 0;
                    text-align: center;
                }
                
                .header-table .col-left h2 {
                    font-size: 16px;
                    margin-bottom: 8px;
                }
                
                .header-table .col-center h3 {
                    font-size: 14px;
                    margin: 8px 0;
                    text-decoration: underline;
                }
                
                .header-table p {
                    margin: 4px 0;
                    font-size: 9px;
                }
                
                .label {
                    font-weight: bold;
                    display: block;
                    margin-bottom: 2px;
                }
                
                .value {
                    display: block;
                    margin-left: 0;
                    margin-bottom: 8px;
                }
                
                /* Items Table */
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                    font-size: 9px;
                    border: 2px solid #000;
                }
                
                .items-table th {
                    border: 1px solid #000;
                    padding: 7px 5px;
                    text-align: center;
                    font-weight: bold;
                    background-color: #ffffff;
                    font-size: 9px;
                    line-height: 1.4;
                    border-bottom: 2px solid #000;
                }
                
                .items-table td {
                    border: 1px solid #000;
                    padding: 6px 5px;
                    font-size: 9px;
                    line-height: 1.3;
                }
                
                .text-center {
                    text-align: center;
                }
                
                .text-right {
                    text-align: right;
                }
                
                /* Summary Section */
                .summary-section {
                    margin: 10px 0;
                    font-size: 9px;
                }
                
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 3px 0;
                    border-bottom: 1px solid #ccc;
                }
                
                .grand-total {
                    font-weight: bold;
                    margin-top: 8px;
                    padding: 8px;
                    border: 1px solid #000;
                    background-color: #000;
                    color: #fff;
                    text-align: right;
                    font-size: 10px;
                }
                
                /* Footer */
                .footer-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 30px;
                    font-size: 9px;
                }
                
                .footer-table td {
                    width: 33.33%;
                    text-align: center;
                    padding-top: 30px;
                    border-top: 1px solid #000;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Header Table with 3 Equal Boxes -->
<table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 10px; font-size: 9px; table-layout: fixed;">
    <tr>
        <!-- Left Box: FROM (Seller) -->
        <td style="border-right: 2px solid #000; padding: 8px 10px; width: 33.33%; vertical-align: top;">
            <div style="font-weight: bold; font-size: 9px; margin-bottom: 4px;">FROM:</div>
            <div style="font-weight: bold; font-size: 10px; margin-bottom: 4px;">FAASO BEES</div>
            <div style="font-size: 8px; line-height: 1.6;">
                <div>NO. 5/1, GANESH NAGAR,</div>
                <div>1ST STREET, ARAKONAM,</div>
                <div>RANIPET, TAMILNADU</div>
            </div>
            <div style="margin-top: 6px; font-size: 8px; line-height: 1.6;">
                <span style="font-weight: bold;">MOBILE: </span>7845863128
            </div>
        </td>

        <!-- Center Box: TAX INVOICE + TO Address -->
        <td style="border-right: 2px solid #000; padding: 8px 10px; width: 33.33%; vertical-align: top;">
            <div style="font-weight: bold; font-size: 12px; text-align: center; text-decoration: underline; margin-bottom: 8px; letter-spacing: 1px;">TAX INVOICE</div>
            <div style="font-weight: bold; font-size: 9px; margin-bottom: 3px;">TO:</div>
            <div style="font-weight: bold; font-size: 9px; margin-bottom: 3px;">Delivery Location</div>
            <div style="font-size: 8px; line-height: 1.6;">
                <div>NO. 2, SRM NAGAR,</div>
                <div>POTHERI, CHENNAI,</div>
                <div>TAMIL NADU - 603203</div>
            </div>
            <div style="margin-top: 6px; font-size: 8px; line-height: 1.6;">
                <span style="font-weight: bold;">LANDMARK: </span>Pathiyam Mandhi Restaurant
            </div>
        </td>

        <!-- Right Box: Bill No, Date, Logo stacked tightly -->
        <td style="padding: 8px 10px; width: 33.33%; vertical-align: top;">
            <table style="width: 100%; border-collapse: collapse; font-size: 8px;">
                <tr>
                    <td style="font-weight: bold; padding: 2px 0; white-space: nowrap;">Bill No:</td>
                    <td style="padding: 2px 0; text-align: right;">${invoiceNumber}</td>
                </tr>
                <tr>
                    <td style="font-weight: bold; padding: 2px 0;">Date:</td>
                    <td style="padding: 2px 0; text-align: right;">${formattedDate}</td>
                </tr>
            </table>

            <div style="text-align: center; margin-top: 10px;">
                <img src="${logoImage}" alt="Logo" style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto;">
                <div style="font-weight: bold; font-size: 10px; margin-top: 6px; letter-spacing: 0.5px;">FAASO BEES</div>
            </div>
        </td>
    </tr>
</table>


                <!-- Items Table -->
                <table class="items-table" style="border: 2px solid #000; width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 9px;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 4%;">SNO</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 8%;">HSN CODE</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 20%;">PARTICULARS</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 10%;">PRODUCT ID</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 7%;">MRP</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 6%;">QTY</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 6%;">CASES</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 9%;">MRP with GST</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 5%;">GST %</th>
                            <th style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8px; width: 9%;">AMOUNT</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${billItems.map((item, index) => `
                            <tr>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 9px;">${index + 1}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 9px;">${item.HSN_Code || '-'}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: left; font-size: 9px;">${item.Product_Name}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 9px;">${item.Product_ID}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: right; font-size: 9px;">₹${item.MRP.toFixed(2)}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 9px;">${item.Quantity}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 9px;">${item.Cases || calculateCases(item.Quantity, item.Units_Per_Case)}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: right; font-size: 9px;">₹${(item.MRP * (1 + item.GST)).toFixed(2)}</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: center; font-size: 9px;">${(item.GST * 100).toFixed(0)}%</td>
                                <td style="border: 1px solid #000; padding: 4px 3px; text-align: right; font-size: 9px;"><strong>₹${item.Total_Amount.toFixed(2)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <!-- Summary Section -->
                <div class="summary-section" style="margin: 5px 0; font-size: 9px;">
                    <div style="padding: 2px 0;"><strong>Total:</strong> ${billItems.length} items | <strong>Qty:</strong> ${totalUnits} | <strong>Cases:</strong> ${totalCases}</div>
                    <div style="padding: 2px 0; border-bottom: 1px solid #999;"><strong>Subtotal (Qty: ${totalUnits}):</strong> <span style="float: right;">₹${totalAmount.toFixed(2)}</span></div>
                    <div style="padding: 2px 0; border-bottom: 1px solid #999;"><strong>GST Amount:</strong> <span style="float: right;">₹${gstAmount.toFixed(2)}</span></div>
                    <div style="padding: 2px 0; border-bottom: 1px solid #999;"><strong>Total Amount:</strong> <span style="float: right;">₹${totalAmount.toFixed(2)}</span></div>
                    <div style="font-weight: bold; margin-top: 5px; padding: 5px; border: 1px solid #000; background-color: #000; color: #fff; text-align: right; font-size: 9px;">NET AMOUNT: ₹${grandTotal.toFixed(2)}</div>
                </div>

                <!-- Footer -->
                <table class="footer-table" style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 9px;">
                    <tr>
                        <td style="width: 33.33%; text-align: center; padding-top: 20px; border-top: 1px solid #000;"><strong>Authorized Signature</strong></td>
                        <td style="width: 33.33%; text-align: center; padding-top: 20px; border-top: 1px solid #000;"></td>
                        <td style="width: 33.33%; text-align: center; padding-top: 20px; border-top: 1px solid #000;"><strong>Receiver Sign</strong></td>
                    </tr>
                </table>
            </div>
        </body>
        </html>
    `;

    // Configure PDF options
    const options = {
        margin: [8, 8, 8, 8],
        filename: `Fasobees_Invoice_${invoiceNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };

    // Generate and download PDF
    return new Promise((resolve, reject) => {
        try {
            html2pdf()
                .set(options)
                .from(invoiceHTML)
                .save()
                .then(() => {
                    console.log('✅ Invoice generated successfully:', invoiceNumber);
                    resolve();
                })
                .catch((error) => {
                    console.error('Error in html2pdf:', error);
                    reject(error);
                });
        } catch (error) {
            console.error('Error generating PDF:', error);
            reject(error);
        }
    });
};