"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState("marks"); // "marks", "attendance", or "settings"
  
  // Marks State
  const [data, setData] = useState([]);
  const [fileName, setFileName] = useState("");
  
  // Attendance State
  const [batches, setBatches] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState("");
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({}); // { studentId: "Absent" | "Present" }
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingStudents, setIsSavingStudents] = useState(false);

  // Configuration State
  const [customCreds, setCustomCreds] = useState({ token: "", phoneId: "", template: "", schoolName: "" });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Global State
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [logs, setLogs] = useState([]);

  // Refs
  const logEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const removeFile = () => {
    setData([]);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    addLog("ℹ File cleared", "info");
  };

  useEffect(() => {
    supabase().auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      const res = await fetch("/api/auth/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const { profile: p } = await res.json();
      if (!p || !p.is_active) { await supabase().auth.signOut(); router.replace("/login"); return; }
      if (p.role === "admin") { router.replace("/admin"); return; }
      setProfile(p);

      // Restore last active tab
      const savedTab = localStorage.getItem("activeTab") || "marks";
      setActiveTab(savedTab);

      setCustomCreds({
        token: p.whatsapp_token || "",
        phoneId: p.phone_number_id || "",
        template: savedTab === "attendance" ? "attendance" : "marks_update",
        schoolName: p.school_name || ""
      });
      
      fetchBatches(session.access_token);
      const savedBatch = localStorage.getItem("selectedBatch");
      if (savedBatch) setSelectedBatch(savedBatch);
    });
  }, []);

  useEffect(() => { 
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);

  useEffect(() => { 
    if (selectedBatch) localStorage.setItem("selectedBatch", selectedBatch);
  }, [selectedBatch]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const addLog = (message, type = "info") =>
    setLogs(prev => [...prev, { message, type, id: Date.now() + Math.random() }]);

  async function fetchBatches(token) {
    try {
      const res = await fetch("/api/attendance/batches", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.data) setBatches(json.data);
    } catch (err) { console.error("Fetch batches error:", err); }
  }

  async function fetchStudents(batchId) {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session) return;
    try {
      const res = await fetch(`/api/attendance/students?batch_id=${batchId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const json = await res.json();
      if (json.data) {
        setStudents(json.data);
        const initialAtt = {};
        json.data.forEach(s => initialAtt[s.id] = "Present");
        setAttendance(initialAtt);
      }
    } catch (err) { console.error("Fetch students error:", err); }
  }

  useEffect(() => {
    if (selectedBatch) fetchStudents(selectedBatch);
    else setStudents([]);
  }, [selectedBatch]);

  async function handleSaveSettings() {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session) return;
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          whatsapp_token: customCreds.token,
          phone_number_id: customCreds.phoneId,
          template_name: customCreds.template,
          school_name: customCreds.schoolName
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProfile(json.profile);
        addLog("✔ Settings saved successfully", "success");
      } else {
        addLog(`✘ Failed to save settings: ${json.error}`, "error");
      }
    } catch (err) { addLog(`✘ Error: ${err.message}`, "error"); }
    setIsSavingSettings(false);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      const wb = XLSX.read(evt.target.result, { type: "array", cellDates: true });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (raw.length > 0) {
        const columns = Object.keys(raw[0]);
        addLog(`ℹ Detected columns: ${columns.join(", ")}`, "info");
      }
      const sanitized = raw.map(row =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => {
          let finalVal = String(v || "").trim();
          
          if (v instanceof Date) {
            // Bulletproof Fix: Move to middle of the day to ignore timezone shifts
            const correctedDate = new Date(v.getTime() + (12 * 60 * 60 * 1000));
            const dd = String(correctedDate.getDate()).padStart(2, '0');
            const mm = String(correctedDate.getMonth() + 1).padStart(2, '0');
            const yyyy = correctedDate.getFullYear();
            finalVal = `${dd}/${mm}/${yyyy}`;
          }
          
          return [k.toLowerCase().replace(/[^a-z0-9]/g, ""), finalVal];
        }))
      );
      setData(sanitized);
      setLogs([]);
      addLog(`✔ Parsed ${sanitized.length} rows from "${file.name}"`, "info");
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleSendMarks() {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session) { addLog("✘ Session expired.", "error"); return; }
    setIsSending(true);
    setProgress({ current: 0, total: data.length });
    addLog(`▶ Starting Marks dispatch…`, "info");
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      setProgress({ current: i + 1, total: data.length });
      
      // Sanitized column keys (lowercase, no spaces, no special chars)
      const studentName = String(row.name || row.studentname || "Student").trim();
      const phoneVal = String(row.number || row.phone || row.whatsapp || "").replace(/\D/g, "");
      const marksVal = String(row.marks || row.score || " ").trim() || " ";
      const testName = String(row.testname || row.test || " ").trim() || " ";
      const testDate = String(row.testdate || row.date || new Date().toLocaleDateString("en-GB")).trim();

      try {
        if (!phoneVal) { addLog(`[Row ${i + 1}] ✘ Skipped — phone missing`, "error"); continue; }
        let phone = phoneVal;
        if (!phone.startsWith("91")) phone = "91" + phone;

        // Log mapping for the first row to help debug
        if (i === 0) {
          addLog(`ℹ Mapping Check: Name=${studentName}, Marks=${marksVal}, Test=${testName}, Date=${testDate}`, "info");
        }

        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify({ 
            phone, 
            params: {
              "student_name": studentName,
              "marks": marksVal,
              "test_name": testName,
              "test_date": testDate
            },
            customToken: customCreds.token, 
            customPhoneId: customCreds.phoneId, 
            customTemplate: "marks_update"
          }),
        });
        const json = await res.json();
        if (json.success) addLog(`[Row ${i + 1}] ✔ Sent to ${studentName}`, "success");
        else {
          addLog(`[Row ${i + 1}] ✘ ${studentName} — ${json.error}`, "error");
          console.error("Meta Send Error:", json.details);
        }
      } catch (err) { addLog(`[Row ${i + 1}] ✘ ${studentName} — System error: ${err.message}`, "error"); }
      await sleep(200);
    }
    addLog("■ Dispatch complete.", "info");
    setIsSending(false);
  }

  async function handleSendAttendance() {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session) { addLog("✘ Session expired.", "error"); return; }
    const absents = students.filter(s => attendance[s.id] === "Absent");
    if (absents.length === 0) { addLog("ℹ No students marked 'Absent'.", "info"); return; }
    setIsSending(true);
    setProgress({ current: 0, total: absents.length });
    addLog(`▶ Sending Alerts to ${absents.length} parents…`, "info");
    for (let i = 0; i < absents.length; i++) {
      const student = absents[i];
      setProgress({ current: i + 1, total: absents.length });
      try {
        let phone = String(student.phone ?? "").replace(/\D/g, "");
        if (!phone.startsWith("91")) phone = "91" + phone;
        const parts = attDate.split("-");
        const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : attDate;
        
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
          body: JSON.stringify({ 
            phone, 
            params: [student.name, "Absent", formattedDate], // Exact 3 parameters for Attendance
            customToken: customCreds.token, 
            customPhoneId: customCreds.phoneId, 
            customTemplate: "attendance" // Fool-proof: Strictly use attendance for this tab
          }),
        });
        const json = await res.json();
        if (json.success) addLog(`✔ Sent to ${student.name}`, "success");
        else {
          addLog(`✘ ${student.name} — ${json.error}`, "error");
          console.error("Meta Send Error:", json.details);
        }
      } catch (err) { addLog(`✘ System error: ${err.message}`, "error"); }
      await sleep(300);
    }
    addLog("■ Attendance alerts finished.", "info");
    setIsSending(false);
  }

  async function saveStudents() {
    const { data: { session } } = await supabase().auth.getSession();
    if (!session || !selectedBatch) return;
    const phones = students.map(s => String(s.phone).replace(/\D/g, ""));
    const hasDupes = phones.some((p, i) => phones.indexOf(p) !== i && p !== "");
    if (hasDupes) { addLog("✘ Duplicate phone numbers found.", "error"); return; }
    setIsSavingStudents(true);
    try {
      const res = await fetch("/api/attendance/students", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ batch_id: selectedBatch, students }),
      });
      const json = await res.json();
      if (json.success) { addLog("✔ Student list saved", "success"); fetchStudents(selectedBatch); }
      else addLog(`✘ Failed: ${json.error}`, "error");
    } catch (err) { addLog(`✘ Error: ${err.message}`, "error"); }
    setIsSavingStudents(false);
  }

  async function createBatch() {
    const name = prompt("Enter Batch Name:");
    if (!name) return;
    const { data: { session } } = await supabase().auth.getSession();
    const res = await fetch("/api/attendance/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (json.data) { setBatches([json.data, ...batches]); setSelectedBatch(json.data.id); }
  }

  async function deleteBatch(id) {
    if (!confirm("Delete this batch?")) return;
    const { data: { session } } = await supabase().auth.getSession();
    const res = await fetch(`/api/attendance/batches?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) { setBatches(batches.filter(b => b.id !== id)); if (selectedBatch === id) setSelectedBatch(""); addLog("✔ Batch deleted", "info"); }
  }

  async function editBatch(id, oldName) {
    const name = prompt("Rename batch to:", oldName);
    if (!name || name === oldName) return;
    const { data: { session } } = await supabase().auth.getSession();
    const res = await fetch("/api/attendance/batches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, name }),
    });
    const json = await res.json();
    if (json.data) { setBatches(batches.map(b => b.id === id ? json.data : b)); addLog("✔ Batch renamed", "info"); }
  }

  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const successCount = logs.filter(l => l.type === "success").length;
  const errorCount = logs.filter(l => l.type === "error").length;
  const logColor = { success: "text-green-400", error: "text-red-400", info: "text-blue-300" };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-semibold text-sm">{profile?.school_name || "Omega Portal"}</span>
          </div>
          <button onClick={async () => { await supabase().auth.signOut(); router.replace("/login"); }}
            className="text-xs text-gray-400 hover:text-white transition-colors">Sign out</button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex bg-gray-900 p-1 rounded-xl border border-gray-800">
          {[
            { id: "marks", label: "Marks Update" },
            { id: "attendance", label: "Attendance" },
            { id: "settings", label: "Configuration" }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => { 
                setActiveTab(tab.id); 
                setLogs([]); 
                // Strictly fix template names on tab switch
                if (tab.id === "marks") setCustomCreds(p => ({ ...p, template: "marks_update" }));
                if (tab.id === "attendance") setCustomCreds(p => ({ ...p, template: "attendance" }));
              }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === tab.id ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "text-gray-400 hover:text-gray-200"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "settings" && (
          <div className="space-y-4 slide-in">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-6">
              <div>
                <h2 className="text-base font-semibold text-white">WhatsApp & Institute Profile</h2>
                <p className="text-xs text-gray-500 mt-1">Changes here will be saved permanently to your account.</p>
              </div>
              <div className="grid grid-cols-1 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 ml-1">Institute Name</label>
                  <input type="text" value={customCreds.schoolName} onChange={(e) => setCustomCreds({...customCreds, schoolName: e.target.value})} placeholder="Omega Coaching Center" className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 ml-1">Permanent Access Token</label>
                    <input type="password" value={customCreds.token} onChange={(e) => setCustomCreds({...customCreds, token: e.target.value})} placeholder="EAAB..." className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 ml-1">Phone Number ID</label>
                    <input type="text" value={customCreds.phoneId} onChange={(e) => setCustomCreds({...customCreds, phoneId: e.target.value})} placeholder="1234567890..." className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 transition-colors" />
                  </div>
                </div>
              </div>
              <button 
                onClick={handleSaveSettings} 
                disabled={isSavingSettings}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white font-semibold rounded-xl text-sm transition-all"
              >
                {isSavingSettings ? "Saving Changes..." : "Save Profile Settings"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "marks" && (
          <div className="space-y-4 slide-in">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs text-gray-500 ml-1">Meta Template Name</label>
              </div>
              <input 
                type="text" 
                value={customCreds.template} 
                onChange={(e) => setCustomCreds({...customCreds, template: e.target.value})} 
                placeholder="e.g. marks_update" 
                className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="relative group">
              <label className="block cursor-pointer">
                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${fileName ? "border-blue-500/50 bg-blue-500/5" : "border-gray-700 hover:border-gray-600"}`}>
                  {fileName ? (
                    <div className="space-y-1">
                      <p className="text-blue-400 text-sm font-medium">{fileName}</p>
                      <p className="text-gray-500 text-[10px]">{data.length} rows detected</p>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Drop Excel file here or click to browse</p>
                  )}
                </div>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".xlsx,.xls" 
                  onChange={handleFile} 
                  disabled={isSending} 
                  className="hidden" 
                />
              </label>
              {fileName && (
                <button 
                  onClick={(e) => { e.preventDefault(); removeFile(); }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-10"
                  title="Remove File"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button onClick={handleSendMarks} disabled={isSending || data.length === 0} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white font-medium rounded-xl text-sm transition-all">
              {isSending ? `Sending Dispatch…` : data.length > 0 ? `Send Marks to ${data.length} Parents` : "Upload file to begin"}
            </button>
          </div>
        )}

        {activeTab === "attendance" && (
          <div className="space-y-4 slide-in">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 ml-1">Select Batch</label>
                  <div className="flex gap-2">
                    <select value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} className="flex-1 bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none">
                      <option value="">Choose a batch...</option>
                      {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button onClick={createBatch} title="New Batch" className="p-2 bg-blue-600 rounded-xl hover:bg-blue-500">+</button>
                    {selectedBatch && (
                      <div className="flex gap-1">
                        <button onClick={() => editBatch(selectedBatch, batches.find(b => b.id === selectedBatch)?.name)} className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white">✎</button>
                        <button onClick={() => deleteBatch(selectedBatch)} className="p-2 bg-gray-800 rounded-xl text-red-400 hover:text-red-300">✖</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500 ml-1">Template Name</label>
                  <input 
                    type="text" 
                    value={customCreds.template} 
                    onChange={(e) => setCustomCreds({...customCreds, template: e.target.value})} 
                    placeholder="attendance" 
                    className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50" 
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs text-gray-500 ml-1">Attendance Date</label>
                  <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>

              {selectedBatch && (
                <div className="space-y-3">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-300">Students</h3>
                    <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
                      <input 
                        type="text" 
                        placeholder="Search student..." 
                        value={studentSearch} 
                        onChange={(e) => setStudentSearch(e.target.value)} 
                        className="bg-black border border-gray-800 rounded-lg px-3 py-1 text-xs focus:outline-none flex-1 md:w-40" 
                      />
                      <button onClick={() => setStudents([...students, { id: 'new-'+Date.now(), name: "", phone: "" }])} className="text-xs text-blue-400 hover:underline">Add Row</button>
                      <button onClick={saveStudents} disabled={isSavingStudents} className="text-xs text-green-400 hover:underline">{isSavingStudents ? "Saving..." : "Save List"}</button>
                    </div>
                  </div>
                  <div className="border border-gray-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[300px]">
                      <thead className="bg-gray-800/50 text-gray-400 text-[10px] uppercase">
                        <tr>
                          <th className="px-4 py-2">Name</th>
                          <th className="px-4 py-2">Phone</th>
                          <th className="px-4 py-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {students.filter(s => (s.name || "").toLowerCase().trim().includes(studentSearch.toLowerCase().trim())).map((s, idx) => {
                          const origIdx = students.findIndex(st => st.id === s.id);
                          return (
                            <tr key={s.id} className="hover:bg-white/5">
                              <td className="px-2 py-1"><input value={s.name || ""} onChange={(e) => { const n = [...students]; n[origIdx].name = e.target.value; setStudents(n); }} placeholder="Name" className="w-full bg-transparent px-2 py-1 focus:outline-none text-xs" /></td>
                              <td className="px-2 py-1"><input value={s.phone || ""} onChange={(e) => { const n = [...students]; n[origIdx].phone = e.target.value; setStudents(n); }} placeholder="91..." className="w-full bg-transparent px-2 py-1 focus:outline-none text-xs" /></td>
                              <td className="px-4 py-1 text-center">
                                <button onClick={() => setAttendance({...attendance, [s.id]: attendance[s.id] === "Absent" ? "Present" : "Absent"})} className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ${attendance[s.id] === "Absent" ? "bg-red-500 text-white" : "bg-green-600 text-white"}`}>
                                  {attendance[s.id] || "Present"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <button onClick={handleSendAttendance} disabled={isSending || !selectedBatch || students.length === 0} className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 text-white font-medium rounded-xl text-sm transition-all shadow-lg shadow-red-900/20">
              {isSending ? `Sending Alerts…` : "Send Absent Alerts"}
            </button>
          </div>
        )}

        {isSending && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500"><span>Dispatch Progress</span><span>{pct}%</span></div>
            <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {logs.length > 0 && (
          <div className="bg-black border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
              <span className="text-xs text-gray-500 font-mono">system log</span>
              <button onClick={() => setLogs([])} className="text-[10px] text-gray-600 hover:text-gray-400">Clear</button>
            </div>
            <div className="p-4 font-mono text-[11px] leading-relaxed max-h-60 overflow-y-auto space-y-0.5">
              {logs.map(log => <div key={log.id} className={logColor[log.type]}>{log.message}</div>)}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
