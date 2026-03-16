export interface DetectionEducation {
  title: string;
  description: string;
  causes: string[];
  prevention: string[];
  whenToSeeDoctor: string;
  specialistType: string;
  severity: Record<string, string>;
}

export const DETECTION_EDUCATION: Record<string, DetectionEducation> = {
  plaque: {
    title: "Plaque",
    description: "Plaque is a sticky film of bacteria that forms on teeth. If not removed regularly, it can harden into tartar and lead to cavities or gum disease.",
    causes: ["Inconsistent brushing", "Sugary or starchy foods", "Infrequent flossing", "Dry mouth"],
    prevention: ["Brush twice daily for 2 minutes", "Floss daily", "Use fluoride toothpaste", "Rinse with antiseptic mouthwash"],
    whenToSeeDoctor: "If plaque hardens into visible yellow or brown tartar deposits",
    specialistType: "dental_hygienist",
    severity: {
      minor: "Small amount detected. Good oral hygiene should resolve this within days.",
      moderate: "Noticeable buildup in several areas. Consider a professional cleaning soon.",
      severe: "Significant buildup detected. Professional cleaning is strongly recommended.",
    },
  },
  tartar: {
    title: "Tartar (Calculus)",
    description: "Tartar is hardened plaque that has mineralized on tooth surfaces. Unlike plaque, tartar cannot be removed by brushing alone — it requires professional cleaning.",
    causes: ["Untreated plaque buildup", "Poor oral hygiene habits", "Mineral-rich saliva", "Smoking"],
    prevention: ["Brush at the gumline", "Use tartar-control toothpaste", "Regular dental cleanings", "Limit starchy foods"],
    whenToSeeDoctor: "Tartar always requires professional removal. Schedule a cleaning.",
    specialistType: "dental_hygienist",
    severity: {
      minor: "Small tartar deposits detected. Schedule a cleaning at your convenience.",
      moderate: "Moderate tartar buildup. Professional cleaning recommended within 2-4 weeks.",
      severe: "Heavy tartar accumulation. Please schedule a cleaning as soon as possible.",
    },
  },
  recession: {
    title: "Gum Recession",
    description: "Gum recession occurs when gum tissue pulls back from teeth, exposing more of the tooth root. This can increase sensitivity and risk of decay.",
    causes: ["Aggressive brushing", "Gum disease", "Teeth grinding", "Misaligned bite"],
    prevention: ["Use a soft-bristled toothbrush", "Don't brush too hard", "Wear a nightguard if grinding", "Regular periodontal checkups"],
    whenToSeeDoctor: "If you notice increased tooth sensitivity or visible root exposure",
    specialistType: "periodontist",
    severity: {
      minor: "Slight recession noted. Monitor and use gentle brushing technique.",
      moderate: "Moderate recession detected. Consult with a periodontist for evaluation.",
      severe: "Significant recession observed. Professional periodontal treatment recommended.",
    },
  },
  cavity: {
    title: "Potential Cavity",
    description: "A cavity is a permanently damaged area on a tooth that develops into a small hole. Cavities are caused by bacteria, frequent snacking, and poor cleaning.",
    causes: ["Bacteria and acid", "Frequent sugary snacks", "Inadequate brushing", "Dry mouth"],
    prevention: ["Brush with fluoride toothpaste", "Limit sugary and acidic foods", "Drink water after meals", "Get regular dental checkups"],
    whenToSeeDoctor: "As soon as possible — cavities only get worse without treatment",
    specialistType: "general_dentist",
    severity: {
      minor: "Early signs detected. A dentist can confirm and apply preventive treatment.",
      moderate: "Likely cavity formation. Schedule a dental visit for evaluation.",
      severe: "Advanced decay detected. Prompt dental treatment is needed.",
    },
  },
  crowding: {
    title: "Tooth Crowding",
    description: "Crowding occurs when there isn't enough space in the jaw for all teeth to fit normally. This can make cleaning difficult and affect bite alignment.",
    causes: ["Genetics", "Early loss of baby teeth", "Extra teeth", "Small jaw size"],
    prevention: ["Regular orthodontic monitoring", "Retainer wear as prescribed", "Early intervention in children"],
    whenToSeeDoctor: "If crowding makes it hard to brush or floss effectively",
    specialistType: "orthodontist",
    severity: {
      minor: "Mild crowding detected. Monitor during regular checkups.",
      moderate: "Moderate crowding noted. Consider orthodontic consultation.",
      severe: "Significant crowding. Orthodontic treatment is recommended.",
    },
  },
  spacing: {
    title: "Tooth Spacing",
    description: "Gaps between teeth can occur naturally or develop over time. While often cosmetic, spacing can affect gum health and chewing function.",
    causes: ["Genetics", "Missing teeth", "Gum disease", "Tongue thrusting habit"],
    prevention: ["Wear retainers as prescribed", "Address missing teeth with replacements", "Regular dental checkups"],
    whenToSeeDoctor: "If gaps are widening or affecting your bite",
    specialistType: "orthodontist",
    severity: {
      minor: "Minor spacing detected. Typically cosmetic.",
      moderate: "Moderate gaps noted. Consider orthodontic evaluation.",
      severe: "Significant spacing that may affect function. Consult an orthodontist.",
    },
  },
  rotation: {
    title: "Tooth Rotation",
    description: "A rotated tooth has turned from its normal position. This can affect bite alignment and make cleaning more difficult.",
    causes: ["Crowding", "Late-erupting teeth", "Trauma", "Genetic factors"],
    prevention: ["Wear retainers as prescribed", "Early orthodontic intervention", "Protect teeth during sports"],
    whenToSeeDoctor: "If the rotation affects your bite or is worsening",
    specialistType: "orthodontist",
    severity: {
      minor: "Slight rotation detected. Monitor during treatment.",
      moderate: "Moderate rotation noted. Discuss with your orthodontist.",
      severe: "Significant rotation requiring orthodontic adjustment.",
    },
  },
  misalignment: {
    title: "Bite Misalignment",
    description: "Misalignment (malocclusion) means your upper and lower teeth don't meet properly when biting. This can cause uneven wear and jaw discomfort.",
    causes: ["Genetics", "Thumb sucking in childhood", "Jaw injury", "Missing teeth"],
    prevention: ["Follow orthodontic treatment plan", "Wear retainers", "Address missing teeth"],
    whenToSeeDoctor: "If you experience jaw pain, headaches, or difficulty chewing",
    specialistType: "orthodontist",
    severity: {
      minor: "Minor misalignment detected. Your treatment is addressing this.",
      moderate: "Moderate misalignment noted. Stay consistent with your treatment plan.",
      severe: "Significant misalignment. Discuss treatment options with your doctor.",
    },
  },
  inflammation: {
    title: "Gum Inflammation",
    description: "Inflamed gums (gingivitis) appear red, swollen, and may bleed when brushing. This is the earliest stage of gum disease and is reversible with proper care.",
    causes: ["Plaque buildup at gumline", "Hormonal changes", "Certain medications", "Poor nutrition"],
    prevention: ["Brush gently at the gumline", "Floss daily", "Use anti-gingivitis mouthwash", "Regular cleanings"],
    whenToSeeDoctor: "If bleeding persists for more than 2 weeks despite improved hygiene",
    specialistType: "periodontist",
    severity: {
      minor: "Slight inflammation detected. Improve brushing at the gumline.",
      moderate: "Noticeable inflammation. Consider a professional cleaning.",
      severe: "Significant inflammation. See a periodontist promptly.",
    },
  },
  bone_change: {
    title: "Bone Changes",
    description: "Changes in the bone supporting your teeth can indicate advancing periodontal disease. Early detection is crucial for preventing tooth loss.",
    causes: ["Advanced gum disease", "Osteoporosis", "Tooth loss", "Chronic infection"],
    prevention: ["Treat gum disease early", "Regular periodontal screenings", "Good oral hygiene", "Adequate calcium and vitamin D"],
    whenToSeeDoctor: "Immediately — bone loss requires professional treatment",
    specialistType: "periodontist",
    severity: {
      minor: "Subtle changes detected. Monitor closely with your dentist.",
      moderate: "Notable bone changes. Periodontal evaluation recommended.",
      severe: "Significant bone changes. Urgent periodontal care needed.",
    },
  },
  appliance_fit: {
    title: "Appliance Fit Issue",
    description: "Your dental appliance (retainer, aligner, etc.) may not be fitting properly. Poor fit can slow treatment progress or cause discomfort.",
    causes: ["Natural tooth movement", "Irregular wear schedule", "Appliance damage", "Treatment progression"],
    prevention: ["Wear appliance as directed", "Handle with care", "Store properly when not in use", "Report issues early"],
    whenToSeeDoctor: "If the appliance causes pain, doesn't seat fully, or feels loose",
    specialistType: "orthodontist",
    severity: {
      minor: "Minor fit variation detected. Continue wearing as prescribed.",
      moderate: "Noticeable fit issue. Contact your orthodontist for adjustment.",
      severe: "Significant fit problem. Schedule an appointment for appliance adjustment.",
    },
  },
};

export function getEducation(tag: string): DetectionEducation | null {
  const key = tag.toLowerCase().replace(/[\s-]+/g, "_");
  return DETECTION_EDUCATION[key] || null;
}
