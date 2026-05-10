import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "doctor" | "patient";

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  roleLoading: boolean;
  onboardingCompleted: boolean | null;
  practiceSetupCompleted: boolean | null;
  suspended: boolean | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    loading: true,
    roleLoading: false,
    onboardingCompleted: null,
    practiceSetupCompleted: null,
    suspended: null,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setState((s) => {
            // Token refresh fires onAuthStateChange with a fresh `session.user`
            // object. If the user id hasn't changed, keep the previous user
            // reference stable so consumers with `useEffect(..., [user])`
            // dependency arrays don't re-fire spuriously every ~50 minutes
            // (or on tab focus). Same goes for `roleLoading` — only flip back
            // to true on a real sign-in, not on a refresh of the same user.
            const sameUser = s.user?.id === session.user.id;
            return {
              ...s,
              user: sameUser ? s.user : session.user,
              session,
              loading: false,
              roleLoading: sameUser ? s.roleLoading : true,
            };
          });
        } else {
          setState({
            user: null,
            session: null,
            role: null,
            loading: false,
            roleLoading: false,
            onboardingCompleted: null,
            practiceSetupCompleted: null,
            suspended: null,
          });
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setState((s) => ({ ...s, loading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!state.user) return;

    let cancelled = false;

    const fetchRoleAndProfile = async () => {
      const [roleResult, profileResult] = await Promise.allSettled([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", state.user!.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("onboarding_completed, practice_setup_completed, suspended")
          .eq("user_id", state.user!.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      const roleRes = roleResult.status === "fulfilled" ? roleResult.value : { data: null };
      const profileRes = profileResult.status === "fulfilled" ? profileResult.value : { data: null };

      setState((s) => ({
        ...s,
        role: (roleRes.data?.role as AppRole) ?? null,
        onboardingCompleted: profileRes.data?.onboarding_completed ?? null,
        practiceSetupCompleted: profileRes.data?.practice_setup_completed ?? null,
        suspended: profileRes.data?.suspended ?? null,
        roleLoading: false,
      }));
    };

    fetchRoleAndProfile();
    return () => { cancelled = true; };
  }, [state.user?.id]);

  const signUp = async (email: string, password: string, role: AppRole, fullName: string, specialty?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, full_name: fullName, ...(specialty ? { specialty } : {}) },
        emailRedirectTo: window.location.origin,
      },
    });
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { ...state, signUp, signIn, signOut };
}
