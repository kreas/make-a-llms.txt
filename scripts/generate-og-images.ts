import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const articlesDir = path.join(process.cwd(), 'content/articles');
const publicDir = path.join(process.cwd(), 'public');

function run() {
  console.log('Starting OG image generation and resizing...');
  if (!fs.existsSync(articlesDir)) {
    console.error(`Articles directory not found: ${articlesDir}`);
    return;
  }

  const files = fs.readdirSync(articlesDir).filter(f => f.endsWith('.mdx'));
  console.log(`Found ${files.length} articles to process.`);

  for (const file of files) {
    const filePath = path.join(articlesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract frontmatter block
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      console.log(`Skipping ${file}: no frontmatter found.`);
      continue;
    }

    const frontmatterStr = frontmatterMatch[1];
    
    // Simple frontmatter line-by-line parsing
    const lines = frontmatterStr.split(/\r?\n/);
    const data: Record<string, string> = {};
    for (const line of lines) {
      const firstColon = line.indexOf(':');
      if (firstColon !== -1) {
        const key = line.substring(0, firstColon).trim();
        const value = line.substring(firstColon + 1).trim().replace(/^["']|["']$/g, '');
        data[key] = value;
      }
    }

    const imagePath = data['image'];
    if (!imagePath) {
      console.log(`Skipping ${file}: no image field in frontmatter.`);
      continue;
    }

    // Resolve source image path
    const srcLocalPath = path.join(publicDir, imagePath);
    if (!fs.existsSync(srcLocalPath)) {
      console.log(`Warning: source image ${srcLocalPath} not found for article ${file}.`);
      continue;
    }

    // Parse path to construct destination (always .png format with -og suffix)
    const parsedPath = path.parse(imagePath);
    const destFileName = `${parsedPath.name}-og.png`;
    const destImagePath = path.join(parsedPath.dir, destFileName);
    const destLocalPath = path.join(publicDir, destImagePath);

    let imageGenerated = false;

    if (fs.existsSync(destLocalPath)) {
      console.log(`Image already converted and resized, skipping creation: ${destFileName}`);
      imageGenerated = true;
    } else {
      console.log(`Converting, resizing, and cropping: ${parsedPath.base} -> ${destFileName}`);
      const tempPath = `${srcLocalPath}.temp.png`;
      try {
        // Step 1: Read dimensions
        const sizeOutput = execSync(`sips -g pixelWidth -g pixelHeight "${srcLocalPath}"`).toString();
        const widthMatch = sizeOutput.match(/pixelWidth:\s*(\d+)/);
        const heightMatch = sizeOutput.match(/pixelHeight:\s*(\d+)/);

        if (!widthMatch || !heightMatch) {
          throw new Error('Failed to read image dimensions');
        }

        const width = parseInt(widthMatch[1], 10);
        const height = parseInt(heightMatch[1], 10);
        const aspect = width / height;
        const targetAspect = 1200 / 630;

        // Step 2: Resample preserving aspect ratio
        if (aspect > targetAspect) {
          // Image is wider than target, scale height to 630
          execSync(`sips -s format png --resampleHeight 630 "${srcLocalPath}" --out "${tempPath}"`);
        } else {
          // Image is taller than target, scale width to 1200
          execSync(`sips -s format png --resampleWidth 1200 "${srcLocalPath}" --out "${tempPath}"`);
        }

        // Step 3: Center crop to exactly 1200x630
        execSync(`sips -c 630 1200 "${tempPath}" --out "${destLocalPath}"`);
        console.log(`Successfully generated cropped OG image: ${destLocalPath}`);
        imageGenerated = true;
      } catch (err) {
        console.error(`Error resizing and cropping image ${srcLocalPath} with sips:`, err);
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    }

    if (imageGenerated) {
      // Check if ogImage in frontmatter is already set to the dest path
      if (data['ogImage'] !== destImagePath) {
        console.log(`Updating ogImage in ${file} to ${destImagePath}`);
        
        const fmLines = frontmatterStr.split(/\r?\n/);
        let foundOgImage = false;
        const newFmLines = fmLines.map(line => {
          const firstColon = line.indexOf(':');
          if (firstColon !== -1) {
            const key = line.substring(0, firstColon).trim();
            if (key === 'ogImage') {
              foundOgImage = true;
              const spaces = line.match(/^(\s*)/)?.[1] || '';
              return `${spaces}ogImage: "${destImagePath}"`;
            }
          }
          return line;
        });

        if (!foundOgImage) {
          const canonicalIndex = newFmLines.findIndex(l => {
            const firstColon = l.indexOf(':');
            return firstColon !== -1 && l.substring(0, firstColon).trim() === 'canonical';
          });
          if (canonicalIndex !== -1) {
            newFmLines.splice(canonicalIndex, 0, `ogImage: "${destImagePath}"`);
          } else {
            newFmLines.push(`ogImage: "${destImagePath}"`);
          }
        }

        const newFrontmatterStr = newFmLines.join('\n');
        const newContent = content.replace(frontmatterStr, newFrontmatterStr);
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Successfully updated frontmatter in ${file}`);
      }
    }
  }

  console.log('OG image generation and resizing process completed.');
}

run();
