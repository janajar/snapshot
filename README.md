# M-Hacks 2025 Project: snap-shot
Check out out project on DevPost:
https://devpost.com/software/snap-shot?ref_content=my-projects-tab&ref_feature=my_projects

### Inspiration
- Navigating a large college campus can be difficult for blind or visually impaired students. We wanted to use AR glasses to create a tool that makes campus life more accessible, safe, and independent.

### What it does
- Snap-Shot turns Snap Spectacles into a voice-assisted guide. Users give a simple destination command, and the glasses provide continuous audio navigation with real-time directions and help to get there.

### How we built it
- We integrated campus maps GPS data from the Google Places API. Computer vision on the glasses detects obstacles and the direction the user needs to head. Audio output gives proactive step-by-step guidance with no spoken input required.

### Challenges we ran into
- Integrating multiple data sources (maps, routes, Gemini) into one seamless interface.
- Designing for minimal speech interaction while keeping the user fully informed.
Sending image data to Gemini reliably, it was very spotty in our testing.

### Accomplishments that we're proud of
- Built a functional demo that guides users between campus buildings.
- Created an accessible interface that reduces verbal overhead for users.

### What we learned
- We learned how to merge AR hardware, navigation data, and computer vision into a cohesive system. We also gained insight into accessible design, prioritizing independence and safety for users with visual impairments.

### What's next for Snap-Shot
- We want to make the integration with APIs more reliable, it was very inconsistent and only worked in very specialized scenarios.
