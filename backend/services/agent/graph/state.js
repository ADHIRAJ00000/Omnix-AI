import { Annotation } from "@langchain/langgraph";

export const AgentState =
Annotation.Root({

 prompt:
 Annotation(),

 conversationId:
 Annotation(),

 userId:
 Annotation(),

 agent:
 Annotation(),

 response:
 Annotation(),

 images:
  Annotation(),
 model:
 Annotation(),
  file:
 Annotation(),

 artifacts:
 Annotation(),

 searchResults:
 Annotation(),

 codeContext:
 Annotation(),

 pdfContext:
 Annotation(),

 // Carried through the graph so calls made from inside a node can be traced
 // back to the HTTP request that started the run. LangGraph drops any key that
 // is not declared here, so it has to be part of the state.
 requestId:
 Annotation()

});