const supabaseUrl = window.SUPABASE_URL;
const supabaseAnonKey = window.SUPABASE_ANON_KEY;

if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set.");
}

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

async function callCreateUser(payload) {
  const {
    data: { session },
    error: sessionError,
  } = await supabaseClient.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("User session not found. Please login again.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error || `Create user failed with status ${response.status}`);
  }

  return json;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIndex = header.indexOf("name");
  const emailIndex = header.indexOf("email");
  const roleIndex = header.indexOf("role");

  if (nameIndex === -1 || emailIndex === -1 || roleIndex === -1) {
    throw new Error("CSV must contain name,email,role headers");
  }

  return lines.slice(1).map((line, rowIndex) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      rowNumber: rowIndex + 2,
      name: cols[nameIndex],
      email: cols[emailIndex],
      role: (cols[roleIndex] || "teacher").toLowerCase(),
    };
  });
}

async function createSingleTeacher(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const statusEl = document.getElementById("single-status");
  statusEl.textContent = "Creating user...";

  try {
    const payload = {
      name: form.name.value,
      email: form.email.value,
      role: form.role.value,
    };

    const result = await callCreateUser(payload);
    const tempPassword = result.temporary_password ? ` Temp password: ${result.temporary_password}` : "";
    statusEl.textContent = `Success: ${result.user.email} created.${tempPassword}`;
    form.reset();
  } catch (error) {
    statusEl.textContent = `Failed: ${error.message}`;
  }
}

async function uploadCsvTeachers(event) {
  event.preventDefault();
  const fileInput = document.getElementById("csv-file");
  const statusEl = document.getElementById("csv-status");

  if (!fileInput.files?.length) {
    statusEl.textContent = "Please choose a CSV file first.";
    return;
  }

  const csvText = await fileInput.files[0].text();
  let rows;

  try {
    rows = parseCsv(csvText);
    if (!rows.length) {
      statusEl.textContent = "CSV has no data rows.";
      return;
    }
  } catch (error) {
    statusEl.textContent = `CSV parse error: ${error.message}`;
    return;
  }

  let successCount = 0;
  const errors = [];
  statusEl.textContent = `Processing ${rows.length} rows...`;

  for (const row of rows) {
    try {
      await callCreateUser({ name: row.name, email: row.email, role: row.role });
      successCount += 1;
    } catch (error) {
      errors.push(`Row ${row.rowNumber} (${row.email}): ${error.message}`);
    }
  }

  statusEl.textContent = `Upload completed. Success: ${successCount}/${rows.length}.`;
  if (errors.length) {
    statusEl.textContent += ` Errors: ${errors.join(" | ")}`;
  }
}

document.getElementById("single-create-form")?.addEventListener("submit", createSingleTeacher);
document.getElementById("csv-upload-form")?.addEventListener("submit", uploadCsvTeachers);
