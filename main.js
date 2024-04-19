//this funciton is used to change the status of the task in bitrix. Modify accordingly 
const updateStatusInBitrix = async(taskId, statusMessage) => {
    try {
        const statuses = {
            'todo': 2,
            'in progress': 3,
            'ready to test': 4,
            'fixed': 5
        }
        if(!statusMessage || statusMessage===""){
            return "Nothing in the statusMessage";
        }
        const tasksData = {
            "TITLE": statusMessage,
            "IS_COMPLETE": "Y"
        }
        const resp = await fetch(`${process.env.BITRIX_WEBHOOK}/task.checklistitem.add?taskId=${taskId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({fields: tasksData}),
        })
        const response = await resp.json();
        return response;
    } catch (error) {
        console.log(error.message);
        return error.message;
    } 
}

//this function is used to add the comment in bitbucket
const addCommentinBit = async (pullRequestId, repoSlug, taskId) => {
    try {
        const taskUrl = `https://dhwaniris.bitrix24.in/company/personal/user/1/tasks/task/view/${taskId}/`
        const bitComment = {
            "raw": `The task/issue link is: [issue-${taskId}](${taskUrl})` 
        }
        
        //making the post request to bitbucket to add issue link in comment
        const bitResponse = await fetch(`https://api.bitbucket.org/2.0/repositories/${repoSlug}/pullrequests/${pullRequestId}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BITBUCKET_TOKEN}`
          },
          body: JSON.stringify({'content': bitComment}),
        });
        const bitResponseData = await bitResponse.json();
        return bitResponseData;

    } catch (error) {
        console.log(error.message);
        return error.message;
    }
}

//this function is used to add the comment in bitrix
const addCommentInBitrix24 = async (taskId, message ) => {
    try {
        const bitrixComment = {
            POST_MESSAGE: message
        }
        console.log(bitrixComment);
        const bitrixResponse = await fetch(`${process.env.BITRIX_WEBHOOK}/task.commentitem.add?taskId=${taskId}`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({"fields": bitrixComment})
        })
    
        const response = await bitrixResponse.json();
        return response;
    } catch (error) {
        console.log(error.message);
        return error.message;
    }
}

// sample destination message:"* changes in dimensions\n* MFORM-34 in dimensions 2\n* MFORM-2456 in dimension\n* MFORM-238 in dimension 2 [ready for stagging]\n\n"

//this is the main function that handle the pull request
const handlePullrequest = async (req, res)=>{
    try {
        
        //x-event-key values for pullrequest can be :created, :updated, :approved, :unapproved, :fulfilled, :rejected
        //fetching pull-request type
        let pullrequestType = req.headers['x-event-key'];

        const pullRequestId=parseInt(req.body?.pullrequest?.id) ;
        const repoSlug= req.body?.repository?.full_name 
        let title = req.body?.pullrequest?.title;
        let description = req.body?.pullrequest?.description;
        const creator = req.body?.actor?.display_name    //req.body.pullrequest.author.display_name
        const pullrequestUrl = req.body?.pullrequest?.links?.html?.href

        //branch information
        const destBranch = req.body.pullrequest.destination?.branch.name;
        const destCommit = req.body.pullrequest.destination?.commit.links.html.href;
        const sourceBranch = req.body.pullrequest.source?.branch.name;
        const sourceCommit = req.body.pullrequest.source?.commit.links.html.href
        const declineMessage = req.body.pullrequest.rendered?.reason?.raw || ""

        let taskIds = [];
        const taskIdSet = new Set();

        const regex = /MFORM-(\d+)/g
        let match;
        while ((match = regex.exec(description)) !== null) {
            taskIdSet.add(match[1])
        }
        while((match = regex.exec(title)) != null)
            taskIdSet.add(match[1]);

        while((match = regex.exec(sourceBranch)) != null)
            taskIdSet.add(match[1]);

        for (let id of taskIdSet)
            taskIds.push(parseInt(id));
        console.log(taskIdSet);

        let bitbucketResponses = []
        let bitrixResponses = [];
        let bitrixStatusResponses = [];

        //adding comment in bitbucket for each taskId if PR is created
        if(pullrequestType === 'pullrequest:created'){
            for(let taskId of taskIds){
                const response = await addCommentinBit(pullRequestId, repoSlug, taskId);
                bitbucketResponses.push(response);
            }        
        }

        let bitrixComment='';
        let isChangeStatusInBitrix = 0;
        let prCreationMessage = ""
        let prMergeMessage=""

        if(pullrequestType === 'pullrequest:created'){
            bitrixComment = `<a href='${pullrequestUrl}' target='_blank'> The PR - ${pullRequestId} is created by ${creator} against this task. ${sourceBranch}-->${destBranch} </a>`
            const regex2 = /\[([^[\]]*)\][^\[]*$/;
            const match = description.match(regex2);
            if (match && match.length > 1){
                isChangeStatusInBitrix = 1;
                prCreationMessage = match[1];
            }
        }else if(pullrequestType === 'pullrequest:updated'){
            bitrixComment = `<a href='${sourceCommit}' target='_blank'> A new commit is made against the PR-${pullRequestId} by ${creator}. ${sourceBranch}-->${destBranch} </a> `
        }else if (pullrequestType === 'pullrequest:approved'){
            bitrixComment = `<a href='${pullrequestUrl}' target='_blank'> The PR - ${pullRequestId} is approved by ${creator}. ${sourceBranch}-->${destBranch} </a>`
        }else if (pullrequestType === 'pullrequest:unapproved'){
            bitrixComment = `<a href='${pullrequestUrl}' target='_blank'> The PR - ${pullRequestId} is un-approved by ${creator}. ${sourceBranch}-->${destBranch} </a>`
        }else if(pullrequestType === 'pullrequest:fulfilled'){
            const regex = /\[(.*?)\]/; 
            const match = title.match(regex);
            if (match && match.length > 1){
                prMergeMessage = match[1];
                isChangeStatusInBitrix = 2;
            }
            bitrixComment = `<a href='${pullrequestUrl}' target='_blank'> The PR - ${pullRequestId} is merged to branch ${destBranch} </a>`
        }else if(pullrequestType === 'pullrequest:rejected'){
            bitrixComment = `<a href='${pullrequestUrl}' target='_blank' > The PR - ${pullRequestId} is rejected by ${creator} and leaved with message: ${declineMessage} against the branches ${sourceBranch}-->${destBranch} </a>`
        }

        //adding comment in bitrix consisting of PR url against each taskId
        for(let taskId of taskIds){
            const response = await addCommentInBitrix24(taskId, bitrixComment);
            bitrixResponses.push(response);
        }
        
        if(isChangeStatusInBitrix !== 0){
            for (let taskId of taskIds){
                let statusMessage = (isChangeStatusInBitrix==1)?prCreationMessage:prMergeMessage;
                const response = await updateStatusInBitrix(taskId, statusMessage);
                bitrixStatusResponses.push(response);
            }
        }

        // Send the response back to the client
        res.json({"BitResponse": bitbucketResponses, "BitrixResponse": bitrixResponses, "BitrixStatusResponses": bitrixStatusResponses });
      } catch (error) {
        console.error('Error:', error.message);
        res.status(400).json({ error: error.message });
      }
}

module.exports = {handlePullrequest};

