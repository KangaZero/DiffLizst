
🔍 Comparing two files directly (--no-index mode)
   File 1: ./src/scores/Chopin/etudeOp10No1.xml
   File 2: ./src/scores/Chopin/etudeOp10No1V2.xml

═══════════════════════════════════════════════════
Method 1: Basic Git Diff (-w --patience --no-index)
═══════════════════════════════════════════════════

diff --git a/./src/scores/Chopin/etudeOp10No1.xml b/./src/scores/Chopin/etudeOp10No1V2.xml
index 14d2d3e..f26ddbf 100644
[1m--- a/./src/scores/Chopin/etudeOp10No1.xml[0m
[1m+++ b/./src/scores/Chopin/etudeOp10No1V2.xml[0m
[36m@@ -1,5 +1,6 @@[0m
[32m+[0m
 <?xml version="1.0" encoding="UTF-8"?>
 <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
 <score-partwise version="3.1">
   <identification>
     <encoding>
[36m@@ -99,11 +100,11 @@ attributes[0m
           <line>4</line>
           </clef>
         </attributes>
       <direction placement="above">
         <direction-type>
[31m-          <words default-x="-38.13" default-y="40.00" font-weight="bold" font-family="Times New Roman" font-size="12">Allegro </words>[0m
[32m+          <words default-x="-38.13" default-y="40.00" font-weight="bold" font-family="Times New Roman" font-size="12">Vivace </words>[0m
           </direction-type>
         <direction-type>
           <metronome parentheses="yes" default-x="-38.13" default-y="40.00">
             <beat-unit>quarter</beat-unit>
             <per-minute>176</per-minute>
[36m@@ -373,12 +374,12 @@ attributes[0m
           </notations>
         </note>
       <note default-x="77.16" default-y="-135.00">
         <chord/>
         <pitch>
[31m-          <step>C</step>[0m
[31m-          <octave>3</octave>[0m
[32m+          <step>D</step>[0m
[32m+          <octave>4</octave>[0m
           </pitch>
         <duration>16</duration>
         <tie type="start"/>
         <voice>5</voice>
         <type>whole</type>



═══════════════════════════════════════════════════
Method 2: Enhanced Diff (with parent context tags)
═══════════════════════════════════════════════════

[1m--- a/./src/scores/Chopin/etudeOp10No1.xml[0m
[1m+++ b/./src/scores/Chopin/etudeOp10No1.xml[0m
[36m@@ -1,3 +1,4 @@[0m
[32m+[0m
 <?xml version="1.0" encoding="UTF-8"?>
 <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
 <score-partwise version="3.1">
[36m@@ -71,320 +72,320 @@ measure [measure number="1" width="515.90"][0m
     <measure number="1" width="515.90">
       <print>
         <system-layout>
           <system-margins>
             <left-margin>86.66</left-margin>
             <right-margin>-0.00</right-margin>
             </system-margins>
           <top-system-distance>180.00</top-system-distance>
           </system-layout>
         <staff-layout number="2">
           <staff-distance>70.00</staff-distance>
           </staff-layout>
         </print>
       <attributes>
         <divisions>4</divisions>
         <key>
           <fifths>0</fifths>
           </key>
         <time symbol="common">
           <beats>4</beats>
           <beat-type>4</beat-type>
           </time>
         <staves>2</staves>
         <clef number="1">
           <sign>G</sign>
           <line>2</line>
           </clef>
         <clef number="2">
           <sign>F</sign>
           <line>4</line>
           </clef>
         </attributes>
       <direction placement="above">
         <direction-type>
[31m-          <words default-x="-38.13" default-y="40.00" font-weight="bold" font-family="Times New Roman" font-size="12">Allegro </words>[0m
[32m+          <words default-x="-38.13" default-y="40.00" font-weight="bold" font-family="Times New Roman" font-size="12">Vivace </words>[0m
           </direction-type>
         <direction-type>
           <metronome parentheses="yes" default-x="-38.13" default-y="40.00">
             <beat-unit>quarter</beat-unit>
             <per-minute>176</per-minute>
             </metronome>
           </direction-type>
         <staff>1</staff>
         <sound tempo="176"/>
         </direction>
       <direction placement="below">
         <direction-type>
           <dynamics default-x="6.52" default-y="-80.00" relative-x="-4.65" relative-y="-3.97">
             <f/>
             </dynamics>
           </direction-type>
         <staff>1</staff>
         <sound dynamics="106.67"/>
         </direction>
       <note>
         <rest>
           <display-step>G</display-step>
           <display-octave>2</display-octave>
           </rest>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <staff>1</staff>
         </note>
       <direction placement="above">
         <direction-type>
           <dynamics default-x="3.29" default-y="-80.00" relative-x="-3.93" relative-y="87.38">
             <other-dynamics>legato</other-dynamics>
             </dynamics>
           </direction-type>
         <staff>1</staff>
         </direction>
       <note default-x="107.59" default-y="-135.00">
         <pitch>
           <step>C</step>
           <octave>3</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>2</staff>
         <beam number="1">begin</beam>
         <beam number="2">begin</beam>
         </note>
       <note default-x="134.71" default-y="-115.00">
         <pitch>
           <step>G</step>
           <octave>3</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>2</staff>
         <beam number="1">continue</beam>
         <beam number="2">continue</beam>
         </note>
       <note default-x="161.82" default-y="-100.00">
         <pitch>
           <step>C</step>
           <octave>4</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>2</staff>
         <beam number="1">end</beam>
         <beam number="2">end</beam>
         </note>
       <note default-x="188.94" default-y="-40.00">
         <pitch>
           <step>E</step>
           <octave>4</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>up</stem>
         <staff>1</staff>
         <beam number="1">begin</beam>
         <beam number="2">begin</beam>
         <notations>
           <articulations>
             <accent/>
             </articulations>
           </notations>
         </note>
       <note default-x="216.05" default-y="-50.00">
         <pitch>
           <step>C</step>
           <octave>4</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>up</stem>
         <staff>1</staff>
         <beam number="1">continue</beam>
         <beam number="2">continue</beam>
         </note>
       <note default-x="243.16" default-y="-30.00">
         <pitch>
           <step>G</step>
           <octave>4</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>up</stem>
         <staff>1</staff>
         <beam number="1">continue</beam>
         <beam number="2">continue</beam>
         </note>
       <note default-x="270.28" default-y="-15.00">
         <pitch>
           <step>C</step>
           <octave>5</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>up</stem>
         <staff>1</staff>
         <beam number="1">end</beam>
         <beam number="2">end</beam>
         </note>
       <note default-x="297.39" default-y="-5.00">
         <pitch>
           <step>E</step>
           <octave>5</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">begin</beam>
         <beam number="2">begin</beam>
         <notations>
           <articulations>
             <accent/>
             </articulations>
           </notations>
         </note>
       <note default-x="324.50" default-y="-15.00">
         <pitch>
           <step>C</step>
           <octave>5</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">continue</beam>
         <beam number="2">continue</beam>
         </note>
       <note default-x="351.62" default-y="5.00">
         <pitch>
           <step>G</step>
           <octave>5</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">continue</beam>
         <beam number="2">continue</beam>
         </note>
       <note default-x="378.73" default-y="20.00">
         <pitch>
           <step>C</step>
           <octave>6</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">end</beam>
         <beam number="2">end</beam>
         </note>
       <direction placement="above">
         <direction-type>
           <octave-shift type="down" size="8" number="1" default-y="59.36" relative-x="-10.97"/>
           </direction-type>
         <staff>1</staff>
         </direction>
       <note default-x="405.85" default-y="-5.00">
         <pitch>
           <step>E</step>
           <octave>6</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">begin</beam>
         <beam number="2">begin</beam>
         <notations>
           <articulations>
             <accent/>
             </articulations>
           </notations>
         </note>
       <note default-x="432.96" default-y="-15.00">
         <pitch>
           <step>C</step>
           <octave>6</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">continue</beam>
         <beam number="2">continue</beam>
         </note>
       <note default-x="460.07" default-y="5.00">
         <pitch>
           <step>G</step>
           <octave>6</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">continue</beam>
         <beam number="2">continue</beam>
         </note>
       <note default-x="487.19" default-y="20.00">
         <pitch>
           <step>C</step>
           <octave>7</octave>
           </pitch>
         <duration>1</duration>
         <voice>1</voice>
         <type>16th</type>
         <stem>down</stem>
         <staff>1</staff>
         <beam number="1">end</beam>
         <beam number="2">end</beam>
         </note>
       <backup>
         <duration>16</duration>
         </backup>
       <note default-x="77.16" default-y="-170.00">
         <pitch>
           <step>C</step>
           <octave>2</octave>
           </pitch>
         <duration>16</duration>
         <tie type="start"/>
         <voice>5</voice>
         <type>whole</type>
         <staff>2</staff>
         <notations>
           <tied type="start"/>
           </notations>
         </note>
       <note default-x="77.16" default-y="-135.00">
         <chord/>
         <pitch>
[31m-          <step>C</step>[0m
[31m-          <octave>3</octave>[0m
[32m+          <step>D</step>[0m
[32m+          <octave>4</octave>[0m
           </pitch>
         <duration>16</duration>
         <tie type="start"/>
         <voice>5</voice>
         <type>whole</type>
         <staff>2</staff>
         <notations>
           <tied type="start"/>
           </notations>
         </note>
       </measure>
 



═══════════════════════════════════════════════════
Stats
═══════════════════════════════════════════════════

 ./src/scores/Chopin/{etudeOp10No1.xml => etudeOp10No1V2.xml} | 7 ++++---
 1 file changed, 4 insertions(+), 3 deletions(-)

