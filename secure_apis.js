const fs = require('fs');
const path = require('path');

function getFiles(dir, files = []) {
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      if (name.endsWith('route.ts')) files.push(name);
    }
  }
  return files;
}

const files = getFiles('app/api');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  if (file.includes('ingest')) return; // handled separately
  
  // replace import
  content = content.replace(
    "import { createClient } from '@supabase/supabase-js'",
    "import { createClient } from '@/utils/supabase/server'"
  );
  
  // remove global instance
  content = content.replace(
    "const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)\n",
    ""
  );

  // handle GET, POST, PUT, DELETE
  const methods = ['GET', 'POST', 'PUT', 'DELETE'];
  methods.forEach(method => {
    const fnSignature = `export async function ${method}(req: NextRequest) {`;
    const altSignature = `export async function ${method}() {`;
    
    const secureLogic = `
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })
`;

    if (content.includes(fnSignature)) {
      content = content.replace(fnSignature, fnSignature + secureLogic);
    } else if (content.includes(altSignature)) {
      content = content.replace(altSignature, altSignature + secureLogic);
    }
  });

  fs.writeFileSync(file, content);
  console.log('Secured', file);
});
