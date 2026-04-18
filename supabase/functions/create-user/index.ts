import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

type CreateUserPayload = {
  name: string;
  email: string;
  password?: string;
  role: "admin" | "teacher";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const userToken = authHeader.replace("Bearer ", "");

    const { data: requesterData, error: requesterError } = await adminClient.auth.getUser(userToken);

    if (requesterError || !requesterData.user) {
      return new Response(
        JSON.stringify({ error: "Invalid user token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const requesterAuthId = requesterData.user.id;
    const { data: requesterRow, error: requesterRowError } = await adminClient
      .from("users")
      .select("role")
      .eq("auth_id", requesterAuthId)
      .single();

    if (requesterRowError || !requesterRow || requesterRow.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admin users can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as CreateUserPayload;
    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const role = body.role;

    if (!email || !name || (role !== "admin" && role !== "teacher")) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: name, email, role are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const generatedPassword = body.password?.trim() || crypto.randomUUID().replaceAll("-", "").slice(0, 12);

    const { data: createdAuthUser, error: createAuthError } = await adminClient.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
    });

    if (createAuthError || !createdAuthUser.user) {
      return new Response(
        JSON.stringify({ error: createAuthError?.message || "Failed to create auth user" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authId = createdAuthUser.user.id;

    const { data: dbUser, error: dbInsertError } = await adminClient
      .from("users")
      .insert({
        name,
        email,
        role,
        auth_id: authId,
      })
      .select("id, name, email, role, auth_id")
      .single();

    if (dbInsertError) {
      await adminClient.auth.admin.deleteUser(authId);
      return new Response(
        JSON.stringify({ error: dbInsertError.message || "Failed to insert user row" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: dbUser,
        temporary_password: body.password ? undefined : generatedPassword,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
