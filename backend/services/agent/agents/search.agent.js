import { checkAgentLimit } from "../config/agentRateLimit.js";
import { deductCredits } from "../utils/deductCredits.js";
import { getSearchTool } from "../utils/tavily.js";



export const searchAgent =
async(state)=>{
await checkAgentLimit(
    state.userId,
    "search"
  );
  await deductCredits(state.userId, "search", {
      runId: state.requestId,
      conversationId: state.conversationId,
    }); 
 try{

  const results =
  await getSearchTool().invoke({

 query:state.prompt

} );

console.log(results)

  return {

   ...state,

   searchResults:
   results,
   

  };

 }catch(error){

  console.log(error);

  return {

   ...state,

   searchResults:[]

  };

 }

};