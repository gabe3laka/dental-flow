import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { signIn, user, role, loading, roleLoading } = useAuth();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Already authenticated and role loaded — redirect
  if (!loading && !roleLoading && user && role) {
    if (role === "admin") return <Navigate to="/admin" replace />;
    if (role === "doctor") return <Navigate to="/doctor" replace />;
    return <Navigate to="/patient" replace />;
  }

  // User exists but role is still loading — show transitional state
  if (user && roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse mono-label text-muted-foreground">REDIRECTING</div>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (values: LoginFormValues) => {
    setSubmitting(true);
    const { error, data } = await signIn(values.email, values.password);
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    // Try to accept pending team invites for this user
    if (data?.user?.email) {
      try {
        await supabase.functions.invoke("accept-team-invite", {
          body: { email: data.user.email },
        });
      } catch { /* non-critical */ }
    }
    // Auth guard above will redirect once useAuth updates with role
  });

  const handleForgotPassword = async () => {
    const email = form.getValues("email");
    if (!email || !z.string().email().safeParse(email).success) {
      toast.error("Enter your email address first");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("Password reset link sent to your email");
    } catch (e: any) {
      toast.error(e.message || "Failed to send reset link");
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left — gradient with orb */}
      <div
        className="hidden lg:flex lg:w-1/2 items-center justify-center p-16 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #2a4de0, #6b9aff)" }}
      >
        <div className="absolute right-0 top-1/2 font-mono uppercase tracking-[0.15em] select-none pointer-events-none"
          style={{
            transform: "rotate(-90deg) translateX(50%)",
            transformOrigin: "right center",
            fontSize: "11px",
            color: "rgba(255,255,255,0.15)",
            whiteSpace: "nowrap",
          }}
        >
          AUTH · SECURE LOGIN
        </div>
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full animate-orb-float opacity-20"
          style={{ background: "radial-gradient(circle, #b8a8f0, #e8b4c8, #6b9aff)", filter: "blur(40px)" }}
        />
        <div className="max-w-md text-white relative z-10">
          <h1 className="font-display text-5xl font-light italic leading-tight mb-6">
            Your smile,<br />from anywhere.
          </h1>
          <p className="font-body text-white/70 text-lg font-light">
            Premium virtual dental care connecting doctors and patients seamlessly.
          </p>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background relative">
        <Link to="/" className="absolute top-6 left-8 mono-label text-muted-foreground hover:text-foreground transition-colors">
          ← BACK
        </Link>
        <div className="w-full max-w-sm space-y-8">
          <div>
            <span className="mono-label text-muted-foreground">ARCLINE</span>
            <h2 className="font-display text-3xl font-semibold mt-2">Welcome back</h2>
            <p className="text-muted-foreground font-body font-light mt-1">
              Sign in to your account
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="mono-label text-muted-foreground">EMAIL</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        className="rounded-tag"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="mono-label text-muted-foreground">PASSWORD</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="rounded-tag pr-10"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs text-primary hover:underline font-body mt-1"
                    >
                      {resetSent ? "Reset link sent ✓" : "Forgot password?"}
                    </button>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] text-xs"
              >
                {submitting ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground font-body">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
