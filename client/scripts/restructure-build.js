import { readdir, mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { BASE_PATH } from '../config/base-path.js';

const buildDir = 'build';

async function restructureBuild() {
  try {
    const files = await readdir(buildDir);
    
    // Find all .html files except index.html
    const htmlFiles = files.filter(file => file.endsWith('.html') && file !== 'index.html');
    
    for (const htmlFile of htmlFiles) {
      const routeName = htmlFile.replace('.html', '');
      const routeDir = join(buildDir, routeName);
      const sourceFile = join(buildDir, htmlFile);
      const targetFile = join(routeDir, 'index.html');
      
      // Read the HTML content
      let htmlContent = await readFile(sourceFile, 'utf-8');
      
      // Fix relative paths to absolute paths
      // Replace ./_app with BASE_PATH/_app
      htmlContent = htmlContent.replace(/href="\.\/_app/g, `href="${BASE_PATH}/_app`);
      htmlContent = htmlContent.replace(/href="\.\/assets/g, `href="${BASE_PATH}/assets`);
      htmlContent = htmlContent.replace(/href="\.\/favicon/g, `href="${BASE_PATH}/favicon`);
      
      // Fix import paths in script tags
      htmlContent = htmlContent.replace(/import\("\.\/_app/g, `import("${BASE_PATH}/_app`);
      
      // Fix background image URLs
      htmlContent = htmlContent.replace(/url\('\.\/assets/g, `url('${BASE_PATH}/assets`);
      htmlContent = htmlContent.replace(/url\("\.\/assets/g, `url("${BASE_PATH}/assets`);
      
      // Fix the base path calculation in the script tag
      // Replace: base: new URL(".", location).pathname.slice(0, -1)
      // With: base: BASE_PATH
      htmlContent = htmlContent.replace(
        /base:\s*new URL\("\.",\s*location\)\.pathname\.slice\(0,\s*-1\)/g,
        `base: "${BASE_PATH}"`
      );
      
      // Create directory for route
      await mkdir(routeDir, { recursive: true });
      
      // Write fixed HTML to route/index.html
      await writeFile(targetFile, htmlContent, 'utf-8');
      
      // Delete original .html file
      await unlink(sourceFile);
      
      console.log(`✓ Restructured ${htmlFile} → ${routeName}/index.html`);
    }
    
    console.log('✓ Build restructuring complete!');
  } catch (error) {
    console.error('Error restructuring build:', error);
    process.exit(1);
  }
}

restructureBuild();

