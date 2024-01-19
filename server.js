const express = require('express');
const ethers  = require('ethers');
const app = express();
const abi = require('./common/abi');

//私钥数组，可使用多个数组。介意10-20个地址以内 例如  let pKey = ['私钥一','私钥2','私钥三']
let pKey = [
  '0x1c9f****************************************2b8ba7b2a9'
]
//合约地址
let mintContractAddress = "0xf22dc5c4ad81874333126ea68485c7300547ee17" 
//上级地址，mint时将使用该地址作为上级。（选填）请检查地址有效性
let routeReferrer = "0xefbfb02077db11ef8c1d4bdc15feddce5967d8ca"
//此处更换RPC节点，请使用有效的RPC节点。 参考网站: https://chainlist.org/chain/56
const provider = new ethers.JsonRpcProvider('https://binance.llamarpc.com'); 


var server = app.listen(4201, '0.0.0.0', async () =>  {
  const host = server.address().address;
  const port = server.address().port;
  initData()
  console.log(new Date()+"[Server Info] Start server at http://%s:%s", host, port);
})

let itemData = {
  diffNumber:"",
  challenge:"",
  mintFee:"",
}
function initData(){
  let contract = new ethers.Contract(mintContractAddress, abi, provider)
  contract.difficulty().then(res => { //1当前难度
    itemData.diffNumber = getDiffNumber(res)
  })
  contract.mintFee().then((res) => {
    let mintFee = ethers.formatUnits(res, 18)
    itemData.mintFee = mintFee;
  })
  contract.challenge().then(res => { //2当前挑战数
    itemData.challenge = res
  })
  setTimeout(()=>{
    pKey.forEach(item => {
      mintBefore(item,0)
    })
  },3000)
}
async function mintBefore(pKey,errorNumber){
  let wallet = new ethers.Wallet(pKey,provider);
  if(errorNumber > 20){ //单个地址出现错误再 N次以内，报错后重新执行 默认20
    return  console.log("地址："+wallet.address+" 错误重试尝试次数太多。已终止该地址运行！");
  }
  let resbalance = await provider.getBalance(wallet.address)
  let balanceBNB = Number(ethers.formatUnits(resbalance,18))
  console.log("地址："+wallet.address+" BNB余额"+balanceBNB);
  if(balanceBNB < (Number(itemData.mintFee) + 0.003)){ //这个0.003 为手续费。可自行设置，但需要确保手续费充足！
    return console.log("地址："+wallet.address+" BNB余额不足"+(Number(itemData.mintFee) + 0.003));
  }
  let mintContract = new ethers.Contract(mintContractAddress, abi, provider).connect(wallet)
  let referrer = await mintContract.parentAddress(wallet.address)
  let userMap = {
    address:wallet.address,
    referrer:referrer,
    pKey:pKey,
    errorNumber:errorNumber,
  }
  let count = 0,detime = 3000;
  let isLoopRunning  = true
  mint(userMap,count,detime,mintContract,isLoopRunning)
}

const mint = async (userMap,count,detime,contracts,isLoopRunning) => {
  let loop = true;
  const min = 3000,max = 4000;
  detime = Math.floor(Math.random() * (max - min + 1)) + min;
  count = 0
  while(loop){
      count ++;
      if(count >= detime){
        loop = false
        if(isLoopRunning){
          setTimeout(()=>{
            mint(userMap,count,detime,contracts,isLoopRunning);
          },300)
        }
      }
      try{
        let randomNumUint = generateRandomUint256() //3.生成Uint类型随机数（0- MAX）
        let hash = getHash(itemData.challenge, userMap.address, randomNumUint) //4生成hash，获取当前碰撞值
        if (Number(hash) < Number(itemData.diffNumber)) {
          loop = false;
          console.log("地址："+userMap.address+" successful to mint  you paying!!");
          mineMsd(userMap,randomNumUint,contracts,isLoopRunning);
        }
      }catch(e){  
        loop = false;
        isLoopRunning = false
        console.log("地址："+userMap.address+"MINT 失败",e);
        mintBefore(userMap.pKey,++userMap.errorNumber)
      }
  }
}

const mineMsd = (userMap,randomNum,contracts,isLoopRunning) => {
  if( ethers.isAddress(routeReferrer) 
    && (userMap.referrer == '0x0000000000000000000000000000000000000000') 
    && (routeReferrer != userMap.address)){
      contracts["mine(uint256,address)"](randomNum,routeReferrer,{value:ethers.parseUnits(itemData.mintFee,18)}).then(async tx => {
        console.log("地址："+userMap.address+" On-chain successful, on-chain interaction is in progress. . . . . .")
        await tx.wait()
        isLoopRunning  = false;
        console.log("地址："+userMap.address+"Mint success,hash: "+tx.hash || '--',"success")
        setTimeout(()=>{
          mintBefore(userMap.pKey,++userMap.errorNumber)
        },1000)
      }).catch(e => {
        // "mine(uint256,address)"
        console.error(e);
        let ed = JSON.parse(JSON.stringify(e));
        let info = ((ed && ed.reason) || 'mint error!Please see the console for details!')
        console.log(info,"error")
        isLoopRunning  = false;
        mintBefore(userMap.pKey,++userMap.errorNumber)
      })
  }else{
    contracts["mine(uint256)"](randomNum,{value:ethers.parseUnits(itemData.mintFee,18)}).then(async tx => {
      console.log("地址："+userMap.address+" On-chain successful, on-chain interaction is in progress. . .","success")
      await tx.wait()
      isLoopRunning  = false;
      console.log("地址："+userMap.address+"Mint success,hash: "+tx.hash || '--',"success")
      setTimeout(()=>{
        mintBefore(userMap.pKey,++userMap.errorNumber)
      },1000)
    }).catch(e => {
      isLoopRunning  = false;
      console.error(e);
      let ed = JSON.parse(JSON.stringify(e));
      console.log(ed);
      let info = ((ed && ed.shortMessage) || (ed && ed.reason) || 'mint error!Please see the console for details!')
      console.log(info,"error")
      mintBefore(userMap.pKey,++userMap.errorNumber)
    })
  }
}



function getDiffNumber(difficulty) { //1获取合约难度数，将uint256最大值右移难度位
  const maxUint256 = ethers.MaxUint256;
  const shiftedValue = maxUint256 >> BigInt(Number(difficulty));
  return shiftedValue;
}
// 3生成Uint类型随机数（0- MAX） 生成随机Uint256的函数
function generateRandomUint256() {
    const random=Math.floor(Math.random()*31+1)
    const randomBytes = ethers.randomBytes(random)
    const hash = ethers.hexlify(randomBytes);
    const randomBigNumber = ethers.getBigInt(hash)
    return randomBigNumber
}
//4.生成hash，获取当前碰撞值
function getHash(challenge, msgsender, random) {
  const encodedData = ethers.solidityPacked(["uint", "address", "uint"], [challenge, msgsender, random]);
  const keccak256Hash = ethers.keccak256(encodedData);
  const uint256Value = ethers.getBigInt(keccak256Hash)
  return uint256Value
}
