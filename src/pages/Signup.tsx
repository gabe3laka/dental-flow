import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";

type RoleOption = "doctor" | "patient";

const signupSchema = z.object({
  fullName: z.string().min(1, "Name is required").min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["doctor", "patient"]),
  specialty: z.string().optional(),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function Signup() {
  const [submitting, setSubmitting] = useState(false);
  const { signUp, user, role: authRole, loading } = useAuth();
  const navigate = useNavigate();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      role: "patient",
      specialty: "",
    },
  });

  const selectedRole = form.watch("role") as RoleOption;

  // Redirect authenticated users to their dashboard
  if (!loading && user && authRole) {
    if (authRole === "admin") return <Navigate to="/admin" replace />;
    if (authRole === "doctor") return <Navigate to="/doctor" replace />;
    return <Navigate to="/patient" replace />;
  }

  const onSubmit = form.handleSubmit(async (values: SignupFormValues) => {
    setSubmitting(true);
    const { error } = await signUp(values.email, values.password, values.role, values.fullName, values.specialty || undefined);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Check your email to confirm your account.");
      navigate("/login");
    }
  });

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
            fontSize: "9px",
            color: "rgba(255,255,255,0.15)",
            whiteSpace: "nowrap",
          }}
        >
          AUTH · CREATE ACCOUNT
        </div>
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full animate-orb-float opacity-20"
          style={{ background: "radial-gradient(circle, #b8a8f0, #e8b4c8, #6b9aff)", filter: "blur(40px)" }}
        />
        <div className="max-w-md text-white relative z-10">
          <h1 className="font-display text-5xl font-light italic leading-tight mb-6">
            Start your journey<br />today.
          </h1>
          <p className="font-body text-white/70 text-lg font-light">
            Join the platform that's redefining dental care.
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
            <h2 className="font-display text-3xl font-semibold mt-2">Create account</h2>
            <p className="text-muted-foreground font-body font-light mt-1">
              Select your role to get started
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              {/* Role selector */}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="mono-label text-muted-foreground">I AM A</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        {([
                          { value: "patient" as RoleOption, sub: "For patients in any dental treatment program" },
                          { value: "doctor" as RoleOption, sub: "For orthodontists, dentists, and dental specialists" },
                        ]).map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => field.onChange(r.value)}
                            className={cn(
                              "flex-1 rounded-pill py-3 border transition-all flex flex-col items-center gap-1",
                              field.value === r.value
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-transparent text-muted-foreground border-border hover:border-foreground/20"
                            )}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-[0.15em]">{r.value}</span>
                            <span className={cn(
                              "font-body text-[10px] font-light leading-tight px-2 text-center",
                              field.value === r.value ? "text-primary-foreground/70" : "text-muted-foreground/60"
                            )}>
                              {r.sub}
                            </span>
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedRole === "doctor" && (
                <FormField
                  control={form.control}
                  name="specialty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="mono-label text-muted-foreground">SPECIALTY</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="rounded-tag">
                            <SelectValue placeholder="Select specialty" />
                          </SelectTrigger>
                          <SelectContent>
                            {["Orthodontist", "General Dentist", "Pediatric Dentist", "Prosthodontist", "Periodontist"].map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="fullName" className="mono-label text-muted-foreground">FULL NAME</FormLabel>
                    <FormControl>
                      <Input
                        id="fullName"
                        placeholder={selectedRole === "doctor" ? "Dr. Jane Smith" : "Jane Smith"}
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="email" className="mono-label text-muted-foreground">EMAIL</FormLabel>
                    <FormControl>
                      <Input
                        id="email"
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
                    <FormLabel htmlFor="password" className="mono-label text-muted-foreground">PASSWORD</FormLabel>
                    <FormControl>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="rounded-tag"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={submitting}
                className="w-full rounded-pill bg-primary hover:bg-primary/90 text-primary-foreground font-mono uppercase tracking-[0.15em] text-xs"
              >
                {submitting ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground font-body">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
