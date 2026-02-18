const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'assets/SafePoint-assets/Map.svg');
const outputPath = path.join(__dirname, 'src/constants/mapBase64.js');

try {
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    // Look for xlink:href="data:image/png;base64,..."
    // The regex needs to be loose enough
    const match = svgContent.match(/xlink:href="data:image\/png;base64,([^"]+)"/);

    if (match && match[1]) {
        const base64 = match[1];
        const fileContent = `export const MAP_BASE64 = "data:image/png;base64,${base64}";\n`;
        fs.writeFileSync(outputPath, fileContent);
        console.log('Successfully extracted base64 to src/constants/mapBase64.js');
    } else {
        // Try without xlink namespace if inconsistent
        const match2 = svgContent.match(/href="data:image\/png;base64,([^"]+)"/);
        if (match2 && match2[1]) {
            const base64 = match2[1];
            const fileContent = `export const MAP_BASE64 = "data:image/png;base64,${base64}";\n`;
            fs.writeFileSync(outputPath, fileContent);
            console.log('Successfully extracted base64 to src/constants/mapBase64.js (no xlink)');
        } else {
            console.error('Could not find base64 image data in SVG');
            process.exit(1);
        }
    }
} catch (err) {
    console.error('Error:', err);
    process.exit(1);
}
