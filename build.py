import os
import shutil
import json
import zipfile
import subprocess

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(SRC_DIR, "dist")
CHROME_DIR = os.path.join(DIST_DIR, "chrome")
FIREFOX_DIR = os.path.join(DIST_DIR, "firefox")

def clean_dist():
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR)
    os.makedirs(CHROME_DIR)
    os.makedirs(FIREFOX_DIR)

def copy_project_files(dest_dir):
    ignore_items = {'.git', '.vscode', 'dist', 'build.py', 'node_modules', '__pycache__', 'compiled', 'types.ts', 'tsconfig.json', 'package.json', 'package-lock.json'}
    for item in os.listdir(SRC_DIR):
        if item in ignore_items or item.endswith('.md') or item.endswith('.pem') or item.endswith('.gitignore') or item.endswith('.ts'):
            continue
        
        s = os.path.join(SRC_DIR, item)
        d = os.path.join(dest_dir, item)
        
        if os.path.isdir(s):
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)
    
    # Copy compiled JS files
    compiled_dir = os.path.join(SRC_DIR, "compiled")
    if os.path.exists(compiled_dir):
        for item in os.listdir(compiled_dir):
            if item.endswith('.js'):
                shutil.copy2(os.path.join(compiled_dir, item), os.path.join(dest_dir, item))

def package_zip(source_dir, output_filename):
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)
                zipf.write(file_path, arcname)

def build_chrome():
    print("Building Chrome extension...")
    copy_project_files(CHROME_DIR)
    
    manifest_path = os.path.join(CHROME_DIR, "manifest.json")
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
        
    if "browser_specific_settings" in manifest:
        del manifest["browser_specific_settings"]
        
    if "background" in manifest and "scripts" in manifest["background"]:
        del manifest["background"]["scripts"]
        
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)

    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    ]
    
    executable = next((p for p in chrome_paths if os.path.exists(p)), None)
    crx_path = os.path.join(DIST_DIR, "easy-clicker.crx")
    zip_path = os.path.join(DIST_DIR, "easy-clicker-chrome.zip")
    
    if executable:
        print(f"Found Chrome/Edge at {executable}. Packing CRX...")
        cmd = f'"{executable}" --pack-extension="{os.path.abspath(CHROME_DIR)}"'
        subprocess.run(cmd, shell=True)
        
        generated_crx = os.path.abspath(os.path.join(DIST_DIR, "chrome.crx"))
        if os.path.exists(generated_crx):
            os.rename(generated_crx, crx_path)
        package_zip(CHROME_DIR, zip_path)
    else:
        print("Warning: Google Chrome not found for compiling CRX. Generating only zip instead.")
        package_zip(CHROME_DIR, zip_path)

def build_firefox():
    print("Building Firefox extension...")
    copy_project_files(FIREFOX_DIR)
    
    manifest_path = os.path.join(FIREFOX_DIR, "manifest.json")
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
        
    if "background" in manifest and "service_worker" in manifest["background"]:
        del manifest["background"]["service_worker"]
        
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        
    xpi_path = os.path.join(DIST_DIR, "easy-clicker.xpi")
    package_zip(FIREFOX_DIR, xpi_path)

if __name__ == "__main__":
    print("Starting build process...")
    # Run npm build
    print("Running npm build (TypeScript compilation)...")
    subprocess.run("npm run build", shell=True, check=True, cwd=SRC_DIR)
    
    clean_dist()
    build_chrome()
    build_firefox()
    print(f"Build complete! Output in: {DIST_DIR}")
