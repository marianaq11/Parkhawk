import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { isSupabase, supabase } = await import("../lib/data");
if (!isSupabase()) {
  const { seedLocal, db } = await import("../lib/sqlite");
  console.log(
    seedLocal()
      ? "Created SQLite tables, demo accounts, and fresh simulated reports."
      : "Database already contains users; seed left existing data unchanged. To reset the local demo, stop the app and delete .data/parkhawk.sqlite (including -wal and -shm files), then seed again.",
  );
  db().close();
} else {
  if (process.env.ALLOW_DEMO_SEED !== "true")
    throw new Error(
      "Set ALLOW_DEMO_SEED=true only in a disposable Supabase demo project.",
    );
  const client = supabase(true);
  const { data: existing, error } = await client
    .from("profiles")
    .select("id")
    .limit(1);
  if (error) throw error;
  if (existing?.length)
    throw new Error(
      "Seed requires an empty project to avoid overwriting accounts or reports.",
    );
  const { seedData } = await import("../lib/seed-data");
  const data = seedData();
  const ids = new Map<string, string>();
  for (const profile of data.profiles) {
    const { data: created, error } = await client.auth.admin.createUser({
      email: profile.email,
      password: "ParkHawkDemo2026!",
      email_confirm: true,
      user_metadata: { display_name: profile.display_name },
    });
    if (error || !created.user)
      throw error ?? new Error("User creation failed.");
    ids.set(profile.id, created.user.id);
    const { error: updateError } = await client
      .from("profiles")
      .update({ role: profile.role })
      .eq("id", created.user.id);
    if (updateError) throw updateError;
  }
  const { error: locationError } = await client.from("parking_locations").insert(data.locations);
  if (locationError) throw locationError;
  const reports = data.reports.map(report => ({...report, user_id: ids.get(report.user_id)!}));
  const { error: reportError } = await client.from("reports").insert(reports);
  if (reportError) throw reportError;
  console.log("Seeded Supabase demo accounts and simulated parking reports.");
}
